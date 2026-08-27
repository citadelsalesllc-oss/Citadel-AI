import { ResourceNotFoundError, type CreateWebsiteAuditRecordInput, type WebsiteAuditRecord } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toWebsiteAuditRecord } from '../mappers.js';

/**
 * Mirrors seo-audit-repository.ts exactly — same tenant-isolation pattern
 * (every lookup scoped by (id, clientId) together), same "every audit is
 * worth keeping, never overwritten" rationale (Phase 7's Website Agent).
 */
export const websiteAuditRepository = {
  async create(input: CreateWebsiteAuditRecordInput): Promise<WebsiteAuditRecord> {
    const row = await prisma.websiteAudit.create({
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
    return toWebsiteAuditRecord(row);
  },

  /** All audits for a client, newest first — the basis for "Audit #1 -> Audit #2 -> improvement over time" comparisons. */
  async listByClient(clientId: string, url?: string): Promise<WebsiteAuditRecord[]> {
    const rows = await prisma.websiteAudit.findMany({
      where: url ? { clientId, url } : { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWebsiteAuditRecord);
  },

  async requireByIdForClient(clientId: string, id: string): Promise<WebsiteAuditRecord> {
    const row = await prisma.websiteAudit.findFirst({ where: { id, clientId } });
    if (!row) {
      throw new ResourceNotFoundError('WebsiteAudit', id);
    }
    return toWebsiteAuditRecord(row);
  },

  /**
   * DASHBOARD-ONLY. Deliberately unscoped — see
   * contentRepository.listAllForDashboard's doc comment for the same
   * tenant-isolation exception applied here. Website audits have no
   * mutable dashboard actions (the master spec forbids letting the
   * dashboard alter an audit result), so this is the only dashboard-only
   * addition this repository needs.
   */
  async listAllForDashboard(options: { limit?: number } = {}): Promise<WebsiteAuditRecord[]> {
    const rows = await prisma.websiteAudit.findMany({
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    });
    return rows.map(toWebsiteAuditRecord);
  },

  /** DASHBOARD-ONLY. See listAllForDashboard's doc comment. */
  async requireByIdGlobal(id: string): Promise<WebsiteAuditRecord> {
    const row = await prisma.websiteAudit.findUnique({ where: { id } });
    if (!row) {
      throw new ResourceNotFoundError('WebsiteAudit', id);
    }
    return toWebsiteAuditRecord(row);
  },
};
