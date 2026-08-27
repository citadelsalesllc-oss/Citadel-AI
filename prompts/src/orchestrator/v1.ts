/**
 * Orchestrator routing policy, v1.
 *
 * Not an LLM prompt either, for the same reason as brand-qa: the
 * Orchestrator's classification (agents/src/orchestrator/router.ts) is
 * deliberately a deterministic keyword match, not a model call — fast,
 * free, testable, and transparent about why a request routed where it
 * did (documented since Phase 1's ARCHITECTURE.md). A model-based router
 * can replace this later without changing the Orchestrator's contract;
 * when it does, its actual system prompt belongs in a new file here.
 * Until then, this module holds the versioned POLICY the deterministic
 * router applies — the pattern-to-destination table — kept out of
 * application code so it can be tuned/reviewed without touching
 * router.ts's control flow.
 */

export const POLICY_VERSION = 'orchestrator/v1';

export type ContentPlatformKeyword = 'facebook' | 'instagram' | 'google_business' | 'blog' | 'website' | 'email';

export const PLATFORM_KEYWORD_PATTERNS: ReadonlyArray<readonly [RegExp, ContentPlatformKeyword]> = [
  [/\binstagram\b/i, 'instagram'],
  [/\bgoogle business\b|\bgoogle my business\b|\bgbp\b/i, 'google_business'],
  [/\bfacebook\b|\bfb\b/i, 'facebook'],
  [/\bblog\b/i, 'blog'],
  [/\bemail\b/i, 'email'],
  [/\bwebsite copy\b/i, 'website'],
];

export type SpecialistAgentName = 'seo-agent' | 'website-agent' | 'review-agent' | 'strategy-agent' | 'analytics-agent';

export const AGENT_KEYWORD_PATTERNS: ReadonlyArray<readonly [RegExp, SpecialistAgentName]> = [
  [/\bseo audit\b|\bkeyword research\b|\blocal seo\b/i, 'seo-agent'],
  [/\bwebsite audit\b|\bconversion audit\b|\bux review\b/i, 'website-agent'],
  [/\breview response\b|\brespond to.*review\b|\breputation\b/i, 'review-agent'],
  [/\bmarketing strategy\b|\bcampaign plan\b|\bcompetitive positioning\b/i, 'strategy-agent'],
  [/\banalytics\b|\bperformance report\b|\bmarketing report\b/i, 'analytics-agent'],
];

/** Fallback pattern: a generic content request with no platform keyword defaults to this platform. */
export const DEFAULT_CONTENT_PLATFORM: ContentPlatformKeyword = 'facebook';
export const GENERIC_CONTENT_REQUEST_PATTERN = /\bpost\b|\bcontent\b|\bcaption\b/i;

/** The structured tasks the Orchestrator's task-based entry points (generateContent/runSeoAudit) support — see AGENTS.md. */
export const SUPPORTED_STRUCTURED_TASKS = ['create_social_post', 'seo_audit'] as const;
export type SupportedStructuredTask = (typeof SUPPORTED_STRUCTURED_TASKS)[number];

/**
 * "The orchestrator should determine the correct specialist from the
 * structured task" (Phase 4 spec) — this table is that determination,
 * shared by every structured entry point instead of each one hardcoding
 * its own skill name. Adding a new structured task later means adding one
 * row here and registering the matching skill, not touching Orchestrator's
 * control flow.
 */
export const TASK_SKILL_MAP: Record<SupportedStructuredTask, string> = {
  create_social_post: 'create-social-post',
  seo_audit: 'seo-audit',
};
