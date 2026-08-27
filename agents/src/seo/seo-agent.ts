import { MalformedModelResponseError, type Agent, type AgentContext, type ModelProvider, type SeoEvidence } from '@citadel/shared';
import { seoPromptV1 } from '@citadel/prompts';
import { runConversionChecks, runLocalSeoChecks, runOnPageChecks, runTechnicalChecks } from './checks.js';
import type { SeoAgentInput, SeoAgentOutput } from './types.js';

/** Bumped whenever the deterministic rules or prompt contract change in a way that affects audit results — stored on every persisted SeoAudit row so past audits stay attributable to the logic that produced them. */
export const SEO_AGENT_VERSION = 'seo-agent/v1';

function computeOverallScore(categoryScores: number[]): number {
  return Math.round(categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length);
}

/**
 * Audits one already-fetched webpage for a client: runs the four
 * deterministic check categories (agents/src/seo/checks.ts) to build a
 * technical/on_page/local_seo/conversion scorecard and an evidence
 * catalog, then asks the injected ModelProvider to turn that catalog into
 * prioritized, client-friendly recommendations. The model is the ONLY
 * source of prioritization/explanation — it is never the source of
 * technical truth, and any recommendation it returns that doesn't cite a
 * real evidence id is dropped rather than trusted. See
 * ARCHITECTURE.md "SEO analysis pipeline."
 */
export class SeoAgent implements Agent<SeoAgentInput, SeoAgentOutput> {
  readonly name = 'seo-agent';
  readonly description =
    "Audits a client's webpage for technical, on-page, local SEO, and conversion issues, combining deterministic checks with LLM-prioritized recommendations.";

  constructor(private readonly modelProvider: ModelProvider) {}

  async run(input: SeoAgentInput, context: AgentContext): Promise<SeoAgentOutput> {
    const technical = runTechnicalChecks(input.page);
    const onPage = runOnPageChecks(input.page, context.client, input.targetService, input.targetLocation);
    const localSeo = runLocalSeoChecks(input.page, context.client, input.targetService, input.targetLocation);
    const conversion = runConversionChecks(input.page, context.client);

    const evidence: SeoEvidence[] = [...technical.evidence, ...onPage.evidence, ...localSeo.evidence, ...conversion.evidence];
    const evidenceIds = new Set(evidence.map((e) => e.id));

    const system = seoPromptV1.buildSeoSystemPrompt();
    const userMessage = seoPromptV1.buildSeoUserPrompt(
      context.client,
      evidence,
      input.url,
      input.targetService,
      input.targetLocation,
      input.userInstructions,
    );

    const result = await this.modelProvider.generate({
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1200,
      temperature: 0.4,
      responseSchema: seoPromptV1.SEO_INTERPRETATION_JSON_SCHEMA,
    });

    if (result.structured === undefined) {
      throw new MalformedModelResponseError(result.provider, 'no structured output was returned');
    }
    const parsed = seoPromptV1.SeoInterpretationResultSchema.safeParse(result.structured);
    if (!parsed.success) {
      throw new MalformedModelResponseError(result.provider, parsed.error.message);
    }

    // The actual enforcement point for "do not allow the AI to invent
    // evidence": never trust a cited evidence id blindly. Drop any ref
    // that isn't in the real catalog, and drop a recommendation entirely
    // if none of its refs survive — a recommendation with zero grounded
    // evidence is indistinguishable from a fabricated one.
    const recommendations = parsed.data.recommendations
      .map((rec) => ({
        title: rec.title,
        description: rec.description,
        priority: rec.priority,
        evidenceRefs: rec.evidence_refs.filter((ref) => evidenceIds.has(ref)),
      }))
      .filter((rec) => rec.evidenceRefs.length > 0);

    return {
      url: input.url,
      overallScore: computeOverallScore([technical.score, onPage.score, localSeo.score, conversion.score]),
      technical: { score: technical.score, issues: technical.issues },
      onPage: { score: onPage.score, issues: onPage.issues },
      localSeo: { score: localSeo.score, issues: localSeo.issues },
      conversion: { score: conversion.score, issues: conversion.issues },
      keywordOpportunities: parsed.data.keyword_opportunities,
      recommendations,
      evidence,
      modelUsed: result.model,
      providerUsed: result.provider,
      usage: result.usage,
    };
  }
}
