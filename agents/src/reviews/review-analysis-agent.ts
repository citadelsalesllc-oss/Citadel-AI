import type { Agent, AgentContext } from '@citadel/shared';
import { analyzeReview } from './checks.js';
import type { ReviewAnalysisAgentInput, ReviewAnalysisAgentOutput } from './types.js';

/**
 * Wraps the deterministic review-analysis engine (checks.ts) as an Agent.
 * No model call — `review_analyze` is fully rule-based, the same
 * architectural choice as Brand QA: deterministic, fast, and testable,
 * and it directly answers "what does this review say" without asking an
 * LLM to (possibly inconsistently) re-derive it.
 */
export class ReviewAnalysisAgent implements Agent<ReviewAnalysisAgentInput, ReviewAnalysisAgentOutput> {
  readonly name = 'review-analysis-agent';
  readonly description = 'Analyzes a customer review for sentiment, mentions, concerns, and escalation signals — deterministic, no model call.';

  async run(input: ReviewAnalysisAgentInput, context: AgentContext): Promise<ReviewAnalysisAgentOutput> {
    return analyzeReview(input.review, context.client);
  }
}
