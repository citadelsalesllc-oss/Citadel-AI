import { orchestratorPolicyV1 } from '@citadel/prompts';
import type { ContentPlatform } from '../content/types.js';

export type RoutingDecision =
  | { type: 'content-skill'; platform: ContentPlatform }
  | { type: 'agent'; agentName: 'strategy-agent' | 'seo-agent' | 'review-agent' | 'website-agent' | 'analytics-agent' }
  | { type: 'unsupported'; reason: string };

/**
 * Minimal, deterministic keyword router for the MVP. This is intentionally
 * simple rule-based classification rather than an LLM call — it's fast,
 * free, testable, and transparent about why a request routed where it did.
 * A model-based router can replace this later without changing the
 * Orchestrator's contract. The actual keyword-to-destination table lives in
 * prompts/src/orchestrator/v1.ts as versioned policy, not here — see that
 * module's doc comment for why "prompt" is defined broadly for a
 * deterministic component.
 */
export function classifyRequest(instruction: string): RoutingDecision {
  for (const [pattern, platform] of orchestratorPolicyV1.PLATFORM_KEYWORD_PATTERNS) {
    if (pattern.test(instruction)) {
      return { type: 'content-skill', platform };
    }
  }

  for (const [pattern, agentName] of orchestratorPolicyV1.AGENT_KEYWORD_PATTERNS) {
    if (pattern.test(instruction)) {
      return { type: 'agent', agentName };
    }
  }

  if (orchestratorPolicyV1.GENERIC_CONTENT_REQUEST_PATTERN.test(instruction)) {
    // Generic content request with no platform keyword — default to Facebook,
    // the client's primary social channel for most local service businesses.
    return { type: 'content-skill', platform: orchestratorPolicyV1.DEFAULT_CONTENT_PLATFORM };
  }

  return {
    type: 'unsupported',
    reason: `Could not determine which agent should handle this request: "${instruction}". Try mentioning a platform (Facebook, Instagram, Google Business) or a task type (SEO audit, website audit, review response, marketing strategy, analytics report).`,
  };
}
