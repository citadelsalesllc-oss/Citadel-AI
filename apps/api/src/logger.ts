/**
 * Minimal structured logging for AI generation requests — one JSON line per
 * request, easy to grep or ship to any log aggregator later. Deliberately
 * plain console.log rather than a logging library: this is the only place
 * that needs structured logs today, and a dependency isn't worth it yet.
 *
 * NEVER pass API keys, tokens, or other credentials into `details` — this
 * function logs exactly the fields on GenerationLogEntry and nothing else,
 * so there's no way for a secret to leak through it by accident as long as
 * callers don't add one to the entry shape.
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

export function logGenerationEvent(entry: GenerationLogEntry): void {
  console.log(JSON.stringify({ type: 'ai_generation', timestamp: new Date().toISOString(), ...entry }));
}
