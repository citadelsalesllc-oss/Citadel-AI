import { z } from 'zod';
import type { Agent, AgentContext } from '@citadel/shared';
import {
  checkForbiddenPhrases,
  checkInventedPhoneNumbers,
  checkInventedPrices,
  checkAiSoundingLanguage,
  checkNotEmpty,
  type BrandQaIssue,
} from './checks.js';

export const BrandQaInputSchema = z.object({ body: z.string() });
export type BrandQaInput = z.infer<typeof BrandQaInputSchema>;

export interface BrandQaResult {
  passed: boolean;
  issues: BrandQaIssue[];
}

/**
 * Rule-based quality gate every generated content item passes through
 * before it can be saved as a draft. Blocking issues (forbidden phrases,
 * invented facts) fail QA; warnings (AI-sounding language) are surfaced but
 * don't block. This is deliberately rule-based rather than another model
 * call — deterministic, fast, and testable, and it directly enforces the
 * "never invent client facts" rule rather than trusting a second model to
 * catch the first one's mistakes.
 */
export class BrandQaAgent implements Agent<BrandQaInput, BrandQaResult> {
  readonly name = 'brand-qa-agent';
  readonly description = "Checks generated content against a client's brand rules and stored facts before it can be saved.";

  async run(input: BrandQaInput, context: AgentContext): Promise<BrandQaResult> {
    const issues: BrandQaIssue[] = [
      ...checkNotEmpty(input.body),
      ...checkForbiddenPhrases(input.body, context.client),
      ...checkInventedPhoneNumbers(input.body, context.client),
      ...checkInventedPrices(input.body, context.client),
      ...checkAiSoundingLanguage(input.body),
    ];

    return {
      passed: !issues.some((issue) => issue.severity === 'blocking'),
      issues,
    };
  }
}
