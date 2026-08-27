import { ResourceNotFoundError, type CreateSeoAuditRecordInput, type SeoAuditRecord } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toSeoAuditRecord } from '../mappers.js';

/**
 * Tenant-isolation follows the same pattern as every other client-scoped
 * repository (see service-repository.ts): every lookup is filtered by
 * (id, clientId) together, so an audit id belonging to a different client
 * is indistinguishable from one that doesn't exist.
 */
export const seoAuditRepository = {
  async create(input: CreateSeoAuditRecordInput): Promise<SeoAuditRecord> {
    const row = await prisma.seoAudit.create({
      data: {
        clientId: input.clientId,
        url: input.url,
        overallScore: input.overallScore,
        result: input.result as never,
        agentVersion: input.agentVersion,
        modelProvider: input.modelProvider,
        modelUsed: input.modelUsed,
      },
    });
    return toSeoAuditRecord(row);
  },

  /** All audits for a client, newest first — the basis for "Audit #1 -> Audit #2 -> improvement over time" comparisons. */
  async listByClient(clientId: string, url?: string): Promise<SeoAuditRecord[]> {
    const rows = await prisma.seoAudit.findMany({
      where: url ? { clientId, url } : { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSeoAuditRecord);
  },

  async requireByIdForClient(clientId: string, id: string): Promise<SeoAuditRecord> {
    const row = await prisma.seoAudit.findFirst({ where: { id, clientId } });
    if (!row) {
      throw new ResourceNotFoundError('SeoAudit', id);
    }
    return toSeoAuditRecord(row);
  },

  /**
   * DASHBOARD-ONLY. Deliberately unscoped — see
   * contentRepository.listAllForDashboard's doc comment for the same
   * tenant-isolation exception applied here. SEO audits have no mutable
   * dashboard actions (the master spec explicitly forbids letting the
   * dashboard alter an audit result), so this is the only dashboard-only
   * addition this repository needs.
   */
  async listAllForDashboard(options: { limit?: number } = {}): Promise<SeoAuditRecord[]> {
    const rows = await prisma.seoAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    });
    return rows.map(toSeoAuditRecord);
  },

  /** DASHBOARD-ONLY. See listAllForDashboard's doc comment. */
  async requireByIdGlobal(id: string): Promise<SeoAuditRecord> {
    const row = await prisma.seoAudit.findUnique({ where: { id } });
    if (!row) {
      throw new ResourceNotFoundError('SeoAudit', id);
    }
    return toSeoAuditRecord(row);
  },
};
