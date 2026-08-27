import { Prisma } from '@prisma/client';
import type { ActivityLogEntry, CreateActivityLogInput } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toActivityLogEntry } from '../mappers.js';

function isForeignKeyConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/**
 * The queryable counterpart to apps/api/src/logger.ts's structured JSON
 * console lines — see logGenerationEvent/logSeoAuditEvent/logReviewEvent,
 * which each call `record` below in addition to their existing
 * console.log. Same no-secrets guarantee as those functions: only the
 * fields on ActivityLogEntry are ever persisted.
 */
export const activityLogRepository = {
  /**
   * Some callers (an ai/generate|seo-audit|review request against a
   * client id/slug that turns out not to exist) only have an unresolved
   * identifier to log, not a real Client.id — inserting that against the
   * clientId foreign key would fail. Rather than dropping the whole
   * activity entry (which would silently erase exactly the "request
   * failed, here's why" signal the AI Activity feed exists to show),
   * retry once with clientId: null so the event still lands, just not
   * attributed to a specific client.
   */
  async record(input: CreateActivityLogInput): Promise<ActivityLogEntry> {
    const data = {
      requestId: input.requestId,
      agent: input.agent,
      task: input.task,
      modelProvider: input.modelProvider,
      executionTimeMs: input.executionTimeMs,
      success: input.success,
      errorCode: input.errorCode,
      metadata: input.metadata as never,
    };
    try {
      const row = await prisma.activityLog.create({ data: { ...data, clientId: input.clientId } });
      return toActivityLogEntry(row);
    } catch (error) {
      if (!isForeignKeyConstraintError(error) || input.clientId === null) {
        throw error;
      }
      const row = await prisma.activityLog.create({ data: { ...data, clientId: null } });
      return toActivityLogEntry(row);
    }
  },

  async listByClient(clientId: string, limit?: number): Promise<ActivityLogEntry[]> {
    const rows = await prisma.activityLog.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toActivityLogEntry);
  },

  /**
   * DASHBOARD-ONLY. Deliberately unscoped, same as the other
   * listAllForDashboard methods — the AI Activity feed is inherently
   * cross-client for internal staff. Read-only; there is nothing here for
   * a dashboard action to write.
   */
  async listAllForDashboard(limit?: number): Promise<ActivityLogEntry[]> {
    const rows = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toActivityLogEntry);
  },
};
