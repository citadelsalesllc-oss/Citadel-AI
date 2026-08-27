import { z } from 'zod';
import { type ClientContext, type Review, type Skill, type SkillContext, type ToolRegistry } from '@citadel/shared';
import { ReviewAnalysisAgent, type ReviewAnalysisAgentOutput } from '@citadel/agents';

export const ReviewAnalyzeInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  reviewId: z.string().min(1),
});
export type ReviewAnalyzeInput = z.infer<typeof ReviewAnalyzeInputSchema>;

export interface ReviewAnalyzeOutput {
  review: Review;
  analysis: ReviewAnalysisAgentOutput;
}

export interface ReviewAnalyzeDeps {
  toolRegistry: ToolRegistry;
  reviewAnalysisAgent: ReviewAnalysisAgent;
}

/**
 * Read-only workflow: load client context -> fetch the persisted review ->
 * run the deterministic analysis. No model call, nothing saved — the
 * analysis is recomputed fresh on every call rather than cached, since
 * it's cheap and always consistent with the review's current text.
 */
export function createReviewAnalyzeSkill(deps: ReviewAnalyzeDeps): Skill<ReviewAnalyzeInput, ReviewAnalyzeOutput> {
  return {
    name: 'review-analyze',
    description: 'Analyze a customer review for sentiment, mentions, concerns, and escalation signals.',
    inputSchema: ReviewAnalyzeInputSchema,
    async run(input, context: SkillContext): Promise<ReviewAnalyzeOutput> {
      const client = await deps.toolRegistry.call<ClientContext>(
        'client_context',
        { idOrSlug: input.clientIdOrSlug },
        { actor: context.actor, requestId: context.requestId },
      );

      const review = await deps.toolRegistry.call<Review>(
        'review_get',
        { clientId: client.core.id, reviewId: input.reviewId },
        { actor: context.actor, requestId: context.requestId, clientId: client.core.id },
      );

      const analysis = await deps.reviewAnalysisAgent.run(
        { review },
        { client, actor: context.actor, requestId: context.requestId },
      );

      return { review, analysis };
    },
  };
}
