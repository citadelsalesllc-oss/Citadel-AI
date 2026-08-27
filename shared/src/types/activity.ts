import { z } from 'zod';

/**
 * The persisted counterpart to apps/api/src/logger.ts's structured JSON
 * console lines (Phase 6) — the Command Center dashboard's "AI Activity"
 * feed reads this table, not stdout. Deliberately the same fields as
 * GenerationLogEntry/SeoAuditLogEntry/ReviewLogEntry: only ids and outcome
 * metadata, never generated content, review text, or credentials.
 */
export const ActivityLogEntrySchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  requestId: z.string(),
  agent: z.string(),
  task: z.string(),
  modelProvider: z.string().nullable().default(null),
  executionTimeMs: z.number().int(),
  success: z.boolean(),
  errorCode: z.string().nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().or(z.date()),
});
export type ActivityLogEntry = z.infer<typeof ActivityLogEntrySchema>;

export const CreateActivityLogInputSchema = ActivityLogEntrySchema.omit({ id: true, createdAt: true });
export type CreateActivityLogInput = z.infer<typeof CreateActivityLogInputSchema>;
