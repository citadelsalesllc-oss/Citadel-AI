import { activityLogRepository } from '@citadel/database';

/**
 * Structured logging for AI generation/SEO/review requests — one JSON line
 * per request to console (easy to grep or ship to any log aggregator
 * later), AND one persisted ActivityLog row (the Command Center
 * dashboard's "AI Activity" feed reads the table, not stdout — see Phase 6
 * ARCHITECTURE.md). Both writes share the exact same field set on
 * purpose: whatever is safe to print to console is safe to persist, and
 * vice versa.
 *
 * NEVER pass API keys, tokens, or other credentials into an entry — these
 * functions log/persist exactly the fields on the entry types below and
 * nothing else, so there's no way for a secret to leak through them by
 * accident as long as callers don't add one to an entry shape.
 *
 * A persistence failure (e.g. the DB briefly unavailable) must never break
 * the request it's observing — it's swallowed after being logged to
 * console, same as any other best-effort telemetry.
 */
export interface GenerationLogEntry {
  requestId: string;
  clientId: string;
  agent: string;
  task: string;
  modelProvider: string;
  executionTimeMs: number;
  success: boolean;
  qaPassed?: boolean;
  contentStatus?: string;
  errorCode?: string;
}

export async function logGenerationEvent(entry: GenerationLogEntry): Promise<void> {
  console.log(JSON.stringify({ type: 'ai_generation', timestamp: new Date().toISOString(), ...entry }));
  await persist({
    clientId: entry.clientId,
    requestId: entry.requestId,
    agent: entry.agent,
    task: entry.task,
    modelProvider: entry.modelProvider,
    executionTimeMs: entry.executionTimeMs,
    success: entry.success,
    errorCode: entry.errorCode ?? null,
    metadata: { qaPassed: entry.qaPassed, contentStatus: entry.contentStatus },
  });
}

/** The SEO-audit analogue of GenerationLogEntry — same no-secrets guarantee: only the fields listed here are ever logged/persisted. */
export interface SeoAuditLogEntry {
  requestId: string;
  clientId: string;
  agent: string;
  task: string;
  modelProvider: string;
  executionTimeMs: number;
  success: boolean;
  overallScore?: number;
  errorCode?: string;
}

export async function logSeoAuditEvent(entry: SeoAuditLogEntry): Promise<void> {
  console.log(JSON.stringify({ type: 'seo_audit', timestamp: new Date().toISOString(), ...entry }));
  await persist({
    clientId: entry.clientId,
    requestId: entry.requestId,
    agent: entry.agent,
    task: entry.task,
    modelProvider: entry.modelProvider,
    executionTimeMs: entry.executionTimeMs,
    success: entry.success,
    errorCode: entry.errorCode ?? null,
    metadata: { overallScore: entry.overallScore },
  });
}

/** The review-analyze/review-respond analogue of GenerationLogEntry — same no-secrets guarantee, and never logs/persists review/reviewer text, only ids and outcome metadata. */
export interface ReviewLogEntry {
  requestId: string;
  clientId: string;
  agent: string;
  task: string;
  reviewId?: string;
  modelProvider?: string;
  executionTimeMs: number;
  success: boolean;
  escalationNeeded?: boolean;
  qaPassed?: boolean;
  responseStatus?: string;
  errorCode?: string;
}

export async function logReviewEvent(entry: ReviewLogEntry): Promise<void> {
  console.log(JSON.stringify({ type: 'review_task', timestamp: new Date().toISOString(), ...entry }));
  await persist({
    clientId: entry.clientId,
    requestId: entry.requestId,
    agent: entry.agent,
    task: entry.task,
    modelProvider: entry.modelProvider ?? null,
    executionTimeMs: entry.executionTimeMs,
    success: entry.success,
    errorCode: entry.errorCode ?? null,
    metadata: {
      reviewId: entry.reviewId,
      escalationNeeded: entry.escalationNeeded,
      qaPassed: entry.qaPassed,
      responseStatus: entry.responseStatus,
    },
  });
}

interface PersistInput {
  clientId: string | null;
  requestId: string;
  agent: string;
  task: string;
  modelProvider: string | null;
  executionTimeMs: number;
  success: boolean;
  errorCode: string | null;
  metadata: Record<string, unknown>;
}

async function persist(input: PersistInput): Promise<void> {
  try {
    await activityLogRepository.record(input);
  } catch (error) {
    console.error(JSON.stringify({ type: 'activity_log_persist_failed', timestamp: new Date().toISOString(), error: String(error) }));
  }
}
