import { MalformedModelResponseError, type Agent, type AgentContext, type ModelProvider } from '@citadel/shared';
import { reviewPromptV1 } from '@citadel/prompts';
import { analyzeReview } from './checks.js';
import type { ReviewResponseAgentInput, ReviewResponseAgentOutput } from './types.js';

/**
 * Drafts a reply to one review. Runs the same deterministic analysis
 * `ReviewAnalysisAgent` does (so the two are always consistent — the
 * response is never grounded in a different read of the review than
 * `review_analyze` would report) and hands the resulting evidence, never
 * the raw review, into the prompt as the model's only view of "what
 * concerns exist." Brand QA (reused unchanged from Phase 1) is the
 * factual/brand safety net applied afterward by the review-respond skill
 * — this agent only drafts language, it never decides whether the draft
 * is safe to save.
 */
export class ReviewResponseAgent implements Agent<ReviewResponseAgentInput, ReviewResponseAgentOutput> {
  readonly name = 'review-response-agent';
  readonly description = "Drafts a brand-appropriate reply to a customer review, grounded in the client's context and a deterministic analysis of the review.";

  constructor(private readonly modelProvider: ModelProvider) {}

  async run(input: ReviewResponseAgentInput, context: AgentContext): Promise<ReviewResponseAgentOutput> {
    const analysis = analyzeReview(input.review, context.client);

    const system = reviewPromptV1.buildReviewResponseSystemPrompt(context.client);
    const userMessage = reviewPromptV1.buildReviewResponseUserPrompt(
      context.client,
      input.review.reviewText,
      input.review.rating,
      analysis,
      input.userInstructions,
    );

    const result = await this.modelProvider.generate({
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 500,
      temperature: 0.5,
      responseSchema: reviewPromptV1.REVIEW_RESPONSE_JSON_SCHEMA,
    });

    if (result.structured === undefined) {
      throw new MalformedModelResponseError(result.provider, 'no structured output was returned');
    }
    const parsed = reviewPromptV1.ReviewResponseGenerationSchema.safeParse(result.structured);
    if (!parsed.success) {
      throw new MalformedModelResponseError(result.provider, parsed.error.message);
    }

    return {
      response: parsed.data.response,
      tone: parsed.data.tone,
      cta: parsed.data.cta,
      issues: parsed.data.notes,
      evidence: analysis.evidence,
      escalationNeeded: analysis.escalationNeeded,
      modelUsed: result.model,
      providerUsed: result.provider,
      usage: result.usage,
    };
  }
}
