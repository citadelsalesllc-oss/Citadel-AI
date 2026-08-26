import type { AuditLogEntry, CreateAuditLogInput } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toAuditLogEntry } from '../mappers.js';

export const auditRepository = {
  async record(input: CreateAuditLogInput): Promise<AuditLogEntry> {
    const row = await prisma.auditLog.create({
      data: {
        clientId: input.clientId,
        actor: input.actor,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata as never,
      },
    });
    return toAuditLogEntry(row);
  },

  async listByClient(clientId: string): Promise<AuditLogEntry[]> {
    const rows = await prisma.auditLog.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toAuditLogEntry);
  },
};
