import { MalformedModelResponseError, type Agent, type AgentContext, type ModelProvider, type WebsiteEvidence } from '@citadel/shared';
import { websitePromptV1 } from '@citadel/prompts';
import { buildMobileDisclosure, runBrandChecks, runContentChecks, runConversionChecks, runCustomerJourneyChecks, runFirstImpressionChecks } from './checks.js';
import type { WebsiteAgentInput, WebsiteAgentOutput } from './types.js';

/** Bumped whenever the deterministic rules or prompt contract change in a way that affects audit results — stored on every persisted WebsiteAudit row so past audits stay attributable to the logic that produced them. */
export const WEBSITE_AGENT_VERSION = 'website-agent/v1';

function computeOverallScore(categoryScores: number[]): number {
  return Math.round(categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length);
}

/**
 * Audits one already-fetched webpage for a client, from a marketing/
 * conversion/UX/customer-journey/brand perspective — "how effectively
 * does this website turn visitors into customers?" Runs five
 * deterministic check categories (agents/src/website/checks.ts — one of
 * which, Conversion, reuses the SEO Agent's own conversion checks rather
 * than re-implementing them, see that module's doc comment) to build a
 * scorecard and evidence catalog, plus an always-honest mobile-testing
 * disclosure, then asks the injected ModelProvider to turn the catalog
 * into prioritized, client-friendly recommendations. The model is the
 * ONLY source of prioritization/explanation — it is never the source of
 * technical truth, and any recommendation it returns that doesn't cite a
 * real evidence id is dropped rather than trusted. See ARCHITECTURE.md
 * "Website Intelligence Agent."
 */
export class WebsiteAgent implements Agent<WebsiteAgentInput, WebsiteAgentOutput> {
  readonly name = 'website-agent';
  readonly description =
    "Audits a client's webpage for marketing effectiveness, conversion, customer journey, content quality, and brand consistency, combining deterministic checks with LLM-prioritized recommendations.";

  constructor(private readonly modelProvider: ModelProvider) {}

  async run(input: WebsiteAgentInput, context: AgentContext): Promise<WebsiteAgentOutput> {
    const firstImpression = runFirstImpressionChecks(input.page, context.client, input.targetLocation);
    const conversion = runConversionChecks(input.page, context.client);
    const customerJourney = runCustomerJourneyChecks(input.page, context.client, firstImpression, conversion);
    const content = runContentChecks(input.page, context.client, conversion);
    const brand = runBrandChecks(input.page, context.client);
    const mobile = buildMobileDisclosure();

    const evidence: WebsiteEvidence[] = [
      ...firstImpression.evidence,
      ...conversion.evidence,
      ...customerJourney.evidence,
      ...content.evidence,
      ...brand.evidence,
    ];
    const evidenceIds = new Set(evidence.map((e) => e.id));

    const system = websitePromptV1.buildWebsiteSystemPrompt();
    const userMessage = websitePromptV1.buildWebsiteUserPrompt(
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
      maxTokens: 1400,
      temperature: 0.4,
      responseSchema: websitePromptV1.WEBSITE_INTERPRETATION_JSON_SCHEMA,
    });

    if (result.structured === undefined) {
      throw new MalformedModelResponseError(result.provider, 'no structured output was returned');
    }
    const parsed = websitePromptV1.WebsiteInterpretationResultSchema.safeParse(result.structured);
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
        category: rec.category,
        priority: rec.priority,
        impact: rec.impact,
        effort: rec.effort,
        evidenceRefs: rec.evidence_refs.filter((ref) => evidenceIds.has(ref)),
      }))
      .filter((rec) => rec.evidenceRefs.length > 0);

    // Derived server-side, not asked of the model twice — see
    // WebsiteAuditResultSchema's doc comment in shared/types/website-audit.ts.
    const quickWins = recommendations.filter((r) => r.effort === 'LOW');
    const highImpactChanges = recommendations.filter((r) => r.impact === 'HIGH IMPACT');

    return {
      url: input.url,
      overallScore: computeOverallScore([firstImpression.score, conversion.score, customerJourney.score, content.score, brand.score]),
      firstImpression: { score: firstImpression.score, strengths: firstImpression.strengths, issues: firstImpression.issues },
      conversion: { score: conversion.score, strengths: conversion.strengths, issues: conversion.issues },
      customerJourney: { score: customerJourney.score, frictionPoints: customerJourney.frictionPoints, strengths: customerJourney.strengths },
      content: { score: content.score, strengths: content.strengths, issues: content.issues },
      brand: { score: brand.score, issues: brand.issues },
      mobile,
      priorityRecommendations: recommendations,
      quickWins,
      highImpactChanges,
      evidence,
      modelUsed: result.model,
      providerUsed: result.provider,
      usage: result.usage,
    };
  }
}
