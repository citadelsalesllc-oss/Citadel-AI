import { describe, expect, it } from 'vitest';
import { MockModelProvider } from '@citadel/integrations/models';
import {
  MalformedModelResponseError,
  ModelProviderError,
  type GenerateParams,
  type GenerateResult,
  type ModelProvider,
  type ModelProviderCapabilities,
} from '@citadel/shared';
import { makeTestClient, makeTestPage } from '../test-fixtures.js';
import { WebsiteAgent } from './website-agent.js';

/** Always returns structured output with no fields, simulating a model that ignored the JSON-only instruction. */
class MalformedResponseProvider implements ModelProvider {
  readonly name = 'fake-malformed';
  readonly capabilities: ModelProviderCapabilities = { structuredOutput: true, toolCalling: false };
  async generate(_params: GenerateParams): Promise<GenerateResult> {
    return { text: 'Sure! Here is your audit.', model: 'fake-model', provider: this.name, stopReason: 'end_turn' };
  }
}

/** Always throws, simulating a network/API failure from the underlying provider. */
class FailingProvider implements ModelProvider {
  readonly name = 'fake-failing';
  readonly capabilities: ModelProviderCapabilities = { structuredOutput: true, toolCalling: false };
  async generate(_params: GenerateParams): Promise<GenerateResult> {
    throw new ModelProviderError(this.name, 'connection reset');
  }
}

/** Returns a recommendation citing an evidence id that does not exist in the real catalog — simulates a model trying to smuggle in an invented fact. */
class InventedEvidenceProvider implements ModelProvider {
  readonly name = 'fake-invented-evidence';
  readonly capabilities: ModelProviderCapabilities = { structuredOutput: true, toolCalling: false };
  async generate(_params: GenerateParams): Promise<GenerateResult> {
    const structured = {
      recommendations: [
        {
          title: 'Fabricated finding',
          description: 'This cites an id that does not exist.',
          category: 'CONVERSION',
          priority: 'high',
          impact: 'HIGH IMPACT',
          effort: 'LOW',
          evidence_refs: ['conv-999'],
        },
      ],
      summary: 'A summary.',
    };
    return { text: JSON.stringify(structured), structured, model: 'fake-model', provider: this.name, stopReason: 'end_turn' };
  }
}

describe('WebsiteAgent', () => {
  it('produces a full structured audit combining deterministic findings with LLM recommendations', async () => {
    const agent = new WebsiteAgent(new MockModelProvider());
    const client = makeTestClient();

    const result = await agent.run(
      { url: 'https://example.com/', page: makeTestPage() },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-1' },
    );

    expect(result.url).toBe('https://example.com/');
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.firstImpression.score).toBeGreaterThanOrEqual(0);
    expect(result.conversion.score).toBeGreaterThanOrEqual(0);
    expect(result.customerJourney.score).toBeGreaterThanOrEqual(0);
    expect(result.content.score).toBeGreaterThanOrEqual(0);
    expect(result.brand.score).toBeGreaterThanOrEqual(0);
    expect(result.mobile.tested).toBe(false);
    expect(result.mobile.note.toLowerCase()).toContain('not performed');
    expect(Array.isArray(result.evidence)).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.providerUsed).toBe('mock');

    // Every recommendation must cite a real evidence id from the catalog.
    const evidenceIds = new Set(result.evidence.map((e) => e.id));
    for (const rec of result.priorityRecommendations) {
      expect(rec.evidenceRefs.length).toBeGreaterThan(0);
      for (const ref of rec.evidenceRefs) {
        expect(evidenceIds.has(ref)).toBe(true);
      }
    }
  });

  it('derives quickWins and highImpactChanges from priorityRecommendations rather than asking the model twice', async () => {
    const agent = new WebsiteAgent(new MockModelProvider());
    const client = makeTestClient();

    const result = await agent.run(
      { url: 'https://example.com/', page: makeTestPage() },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-2' },
    );

    expect(result.quickWins.every((r) => r.effort === 'LOW')).toBe(true);
    expect(result.highImpactChanges.every((r) => r.impact === 'HIGH IMPACT')).toBe(true);
    for (const rec of [...result.quickWins, ...result.highImpactChanges]) {
      expect(result.priorityRecommendations).toContainEqual(rec);
    }
  });

  it('drops a recommendation whose evidence id does not exist in the real catalog', async () => {
    const agent = new WebsiteAgent(new InventedEvidenceProvider());
    const client = makeTestClient();

    const result = await agent.run(
      { url: 'https://example.com/', page: makeTestPage() },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-3' },
    );

    expect(result.priorityRecommendations.find((r) => r.title === 'Fabricated finding')).toBeUndefined();
  });

  it('throws MalformedModelResponseError when the model returns no structured output', async () => {
    const agent = new WebsiteAgent(new MalformedResponseProvider());
    const client = makeTestClient();

    await expect(
      agent.run({ url: 'https://example.com/', page: makeTestPage() }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-4' }),
    ).rejects.toThrow(MalformedModelResponseError);
  });

  it('propagates a model provider failure rather than returning a fake success', async () => {
    const agent = new WebsiteAgent(new FailingProvider());
    const client = makeTestClient();

    await expect(
      agent.run({ url: 'https://example.com/', page: makeTestPage() }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-5' }),
    ).rejects.toThrow(ModelProviderError);
  });

  it('reports a weak page honestly — low conversion score, real issues, no fabricated strengths', async () => {
    const agent = new WebsiteAgent(new MockModelProvider());
    const client = makeTestClient();
    const weakPage = makeTestPage({
      title: null,
      h1Count: 0,
      headings: [],
      textExcerpt: 'Some words about a business.',
      links: [],
      formCount: 0,
      telLinks: [],
      mailtoLinks: [],
      phoneNumberMatches: [],
      wordCount: 20,
    });

    const result = await agent.run(
      { url: 'https://example.com/', page: weakPage },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-6' },
    );

    expect(result.conversion.issues.length).toBeGreaterThan(0);
    expect(result.firstImpression.issues.length).toBeGreaterThan(0);
    expect(result.customerJourney.frictionPoints.length).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThan(70);
  });

  it('flags a brand-forbidden phrase found on the page', async () => {
    const agent = new WebsiteAgent(new MockModelProvider());
    const client = makeTestClient();
    const page = makeTestPage({ textExcerpt: `${makeTestPage().textExcerpt} We are the best in the world.` });

    const result = await agent.run(
      { url: 'https://example.com/', page },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-7' },
    );

    expect(result.brand.issues.some((i) => i.includes('best in the world'))).toBe(true);
  });
});
