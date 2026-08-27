import type { SeoAuditResult, WebsiteFetchResult } from '@citadel/shared';

/**
 * SeoAgent's input. `page` is the already-fetched, already-parsed website
 * data — injected by the caller (the seo-audit skill), exactly like
 * ContentAgent's `previousContent` — the agent never fetches anything
 * itself (see ARCHITECTURE.md "SEO analysis pipeline"). Not a Zod schema
 * like ContentAgentInputSchema: WebsiteFetchResult's shape (nested
 * objects, a Date field) isn't naturally round-trippable through Zod
 * validation, and nothing re-parses this object at the agent boundary —
 * only the skill's own Zod-validated input schema is what an external
 * caller's request actually passes through.
 */
export interface SeoAgentInput {
  url: string;
  page: WebsiteFetchResult;
  targetService?: string;
  targetLocation?: string;
  userInstructions?: string;
}

export type SeoAgentOutput = SeoAuditResult;
