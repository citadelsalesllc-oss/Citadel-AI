import type { WebsiteAuditResult, WebsiteFetchResult } from '@citadel/shared';

/**
 * WebsiteAgent's input. `page` is the already-fetched, already-parsed
 * website data — injected by the caller (the website-audit skill), exactly
 * like SeoAgentInput. The agent never fetches anything itself — see
 * ARCHITECTURE.md "Website Intelligence Agent."
 */
export interface WebsiteAgentInput {
  url: string;
  page: WebsiteFetchResult;
  targetService?: string;
  targetLocation?: string;
  userInstructions?: string;
}

export type WebsiteAgentOutput = WebsiteAuditResult;
