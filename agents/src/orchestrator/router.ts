import type { ContentPlatform } from '../content/types.js';

export type RoutingDecision =
  | { type: 'content-skill'; platform: ContentPlatform }
  | { type: 'agent'; agentName: 'strategy-agent' | 'seo-agent' | 'review-agent' | 'website-agent' | 'analytics-agent' }
  | { type: 'unsupported'; reason: string };

const PLATFORM_KEYWORDS: Array<[RegExp, ContentPlatform]> = [
  [/\binstagram\b/i, 'instagram'],
  [/\bgoogle business\b|\bgoogle my business\b|\bgbp\b/i, 'google_business'],
  [/\bfacebook\b|\bfb\b/i, 'facebook'],
  [/\bblog\b/i, 'blog'],
  [/\bemail\b/i, 'email'],
  [/\bwebsite copy\b/i, 'website'],
];

const AGENT_KEYWORDS: Array<[RegExp, RoutingDecision]> = [
  [/\bseo audit\b|\bkeyword research\b|\blocal seo\b/i, { type: 'agent', agentName: 'seo-agent' }],
  [/\bwebsite audit\b|\bconversion audit\b|\bux review\b/i, { type: 'agent', agentName: 'website-agent' }],
  [/\breview response\b|\brespond to.*review\b|\breputation\b/i, { type: 'agent', agentName: 'review-agent' }],
  [/\bmarketing strategy\b|\bcampaign plan\b|\bcompetitive positioning\b/i, { type: 'agent', agentName: 'strategy-agent' }],
  [/\banalytics\b|\bperformance report\b|\bmarketing report\b/i, { type: 'agent', agentName: 'analytics-agent' }],
];

/**
 * Minimal, deterministic keyword router for the MVP. This is intentionally
 * simple rule-based classification rather than an LLM call — it's fast,
 * free, testable, and transparent about why a request routed where it did.
 * A model-based router can replace this later without changing the
 * Orchestrator's contract.
 */
export function classifyRequest(instruction: string): RoutingDecision {
  for (const [pattern, platform] of PLATFORM_KEYWORDS) {
    if (pattern.test(instruction)) {
      return { type: 'content-skill', platform };
    }
  }

  for (const [pattern, decision] of AGENT_KEYWORDS) {
    if (pattern.test(instruction)) {
      return decision;
    }
  }

  if (/\bpost\b|\bcontent\b|\bcaption\b/i.test(instruction)) {
    // Generic content request with no platform keyword — default to Facebook,
    // the client's primary social channel for most local service businesses.
    return { type: 'content-skill', platform: 'facebook' };
  }

  return {
    type: 'unsupported',
    reason: `Could not determine which agent should handle this request: "${instruction}". Try mentioning a platform (Facebook, Instagram, Google Business) or a task type (SEO audit, website audit, review response, marketing strategy, analytics report).`,
  };
}
