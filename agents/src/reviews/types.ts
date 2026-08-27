import type { Review, ReviewAnalysisResult, ReviewEvidence } from '@citadel/shared';

export interface ReviewAnalysisAgentInput {
  review: Review;
}
export type ReviewAnalysisAgentOutput = ReviewAnalysisResult;

export interface ReviewResponseAgentInput {
  review: Review;
  userInstructions?: string;
}

export interface ReviewResponseAgentOutput {
  response: string;
  tone: string;
  cta: string | null;
  /** Caveats/notes the model flagged (e.g. a fact it couldn't reference because it wasn't on file). Matches the spec's "issues" field name — not a QA verdict; Brand QA runs separately in the skill. */
  issues: string[];
  evidence: ReviewEvidence[];
  /** Surfaced from the deterministic analysis so callers know to prioritize human review, even though the workflow is always human-approval regardless. */
  escalationNeeded: boolean;
  modelUsed: string;
  providerUsed: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
