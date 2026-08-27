import { z } from 'zod';
import { type ClientContext, type Review, type Skill, type SkillContext, type ToolRegistry } from '@citadel/shared';
import { ReviewResponseAgent, BrandQaAgent, type ReviewResponseAgentOutput, type BrandQaResult } from '@citadel/agents';

export const ReviewRespondInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  reviewId: z.string().min(1),
  userInstructions: z.string().optional(),
});
export type ReviewRespondInput = z.infer<typeof ReviewRespondInputSchema>;

export interface ReviewRespondOutput {
  review: Review;
  generation: ReviewResponseAgentOutput;
  qa: BrandQaResult;
}

export interface ReviewRespondDeps {
  toolRegistry: ToolRegistry;
  reviewResponseAgent: ReviewResponseAgent;
  brandQaAgent: BrandQaAgent;
}

/**
 * Complete, user-facing "draft a reply to this review" workflow: load
 * client context -> fetch the persisted review -> draft a response ->
 * run the SAME Brand QA gate every other generated content passes
 * through (reused unchanged from Phase 1 — see AGENTS.md "Brand QA") ->
 * save. Like create-social-post, this always saves a result: passing QA
 * saves DRAFT, failing saves REVISION_REQUIRED, and the response history
 * (ReviewResponseVersion) grows either way — see review_response_save.
 * Never publishes; the workflow always ends at a human-reviewable draft.
 */
export function createReviewRespondSkill(deps: ReviewRespondDeps): Skill<ReviewRespondInput, ReviewRespondOutput> {
  return {
    name: 'review-respond',
    description: 'Draft a brand-appropriate reply to a customer review and save it as a draft (or flag it for revision if it fails Brand QA).',
    inputSchema: ReviewRespondInputSchema,
    async run(input, context: SkillContext): Promise<ReviewRespondOutput> {
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

      const generation = await deps.reviewResponseAgent.run(
        { review, userInstructions: input.userInstructions },
        { client, actor: context.actor, requestId: context.requestId },
      );

      // 'review_response' is a platform label only Brand QA's per-platform
      // hashtag-threshold lookup uses (no threshold is defined for it, so
      // that specific check is simply a no-op here) — every other check
      // (forbidden phrases, invented phone/price/location, CTA accuracy,
      // AI-sounding language, repetition) applies exactly as it does to
      // any other generated content.
      const qa = await deps.brandQaAgent.run(
        { content: generation.response, hashtags: [], cta: generation.cta, platform: 'review_response' },
        { client, actor: context.actor, requestId: context.requestId },
      );

      const updated = await deps.toolRegistry.call<Review>(
        'review_response_save',
        {
          clientId: client.core.id,
          reviewId: review.id,
          response: {
            responseText: generation.response,
            tone: generation.tone,
            cta: generation.cta,
            qaPassed: qa.passed,
            qaIssues: [...qa.issues, ...qa.warnings],
            createdBy: context.actor.label,
            status: qa.passed ? 'DRAFT' : 'REVISION_REQUIRED',
          },
        },
        { actor: context.actor, requestId: context.requestId, clientId: client.core.id },
      );

      return { review: updated, generation, qa };
    },
  };
}
