import { z } from 'zod';

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  actor: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().or(z.date()),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const CreateAuditLogInputSchema = AuditLogEntrySchema.omit({ id: true, createdAt: true });
export type CreateAuditLogInput = z.infer<typeof CreateAuditLogInputSchema>;
