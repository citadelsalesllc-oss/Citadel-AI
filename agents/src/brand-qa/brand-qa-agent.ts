import { z } from 'zod';
import type { Agent, AgentContext } from '@citadel/shared';
import {
  checkForbiddenPhrases,
  checkPreferredPhrasesUsage,
  checkInventedPhoneNumbers,
  checkInventedPrices,
  checkInventedLocations,
  checkCtaAccuracy,
  checkHashtagFormat,
  checkAiSoundingLanguage,
  checkExcessiveRepetition,
  checkNotEmpty,
  type BrandQaIssue,
} from './checks.js';

export const BrandQaInputSchema = z.object({
  content: z.string(),
  hashtags: z.array(z.string()).default([]),
  cta: z.string().nullable().default(null),
  platform: z.string(),
});
export type BrandQaInput = z.infer<typeof BrandQaInputSchema>;

export interface BrandQaResult {
  passed: boolean;
  /** Blocking findings — content fails QA and is saved as REVISION_REQUIRED, never DRAFT. */
  issues: BrandQaIssue[];
  /** Non-blocking findings — surfaced to the reviewer, don't prevent a DRAFT save. */
  warnings: BrandQaIssue[];
}

/**
 * Rule-based quality gate every generated content item passes through
 * before it can be saved. Checks client facts, service/location accuracy,
 * brand voice signals (forbidden/preferred phrases), unsupported claims
 * (invented phone numbers, prices, locations, CTA channels), hashtag
 * appropriateness, and AI-sounding/repetitive language. This is
 * deliberately rule-based rather than another model call — deterministic,
 * fast, and testable, and it directly enforces the "never invent client
 * facts" rule rather than trusting a second model to catch the first
 * one's mistakes. See prompts/src/brand-qa/v1.ts for the versioned
 * thresholds/phrase lists these checks apply.
 */
export class BrandQaAgent implements Agent<BrandQaInput, BrandQaResult> {
  readonly name = 'brand-qa-agent';
  readonly description = "Checks generated content against a client's brand rules and stored facts before it can be saved.";

  async run(input: BrandQaInput, context: AgentContext): Promise<BrandQaResult> {
    const findings: BrandQaIssue[] = [
      ...checkNotEmpty(input.content),
      ...checkForbiddenPhrases(input.content, context.client),
      ...checkPreferredPhrasesUsage(input.content, context.client),
      ...checkInventedPhoneNumbers(input.content, context.client),
      ...checkInventedPrices(input.content, context.client),
      ...checkInventedLocations(input.content, context.client),
      ...checkCtaAccuracy(input.cta, context.client),
      ...checkHashtagFormat(input.hashtags, input.platform),
      ...checkAiSoundingLanguage(input.content),
      ...checkExcessiveRepetition(input.content),
    ];

    const issues = findings.filter((f) => f.severity === 'blocking');
    const warnings = findings.filter((f) => f.severity === 'warning');

    return {
      passed: issues.length === 0,
      issues,
      warnings,
    };
  }
}
