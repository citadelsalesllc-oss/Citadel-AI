import { createStubAgent } from '../stub-agent.js';

/**
 * The free-text Orchestrator.handle() router still points review-flavored
 * instructions ("Respond to that review...") at this stub, registered in
 * agents/src/orchestrator/agent-registry.ts — that entry point has no way
 * to identify WHICH review out of free text, and review_analyze/
 * review_response both require a reviewId. The REAL Review Agents (see
 * ./review-analysis-agent.js and ./review-response-agent.js) are used
 * exclusively via the structured entry point (Orchestrator.runReviewTask()
 * -> the review-analyze/review-respond skills), the same relationship
 * ContentAgent has to create-social-post and SeoAgent has to seo-audit.
 */
export const reviewAgent = createStubAgent(
  'review-agent',
  'Customer review analysis, review response drafting, and reputation-management recommendations',
);

export { ReviewAnalysisAgent } from './review-analysis-agent.js';
export { ReviewResponseAgent } from './review-response-agent.js';
export type { ReviewAnalysisAgentInput, ReviewAnalysisAgentOutput, ReviewResponseAgentInput, ReviewResponseAgentOutput } from './types.js';
