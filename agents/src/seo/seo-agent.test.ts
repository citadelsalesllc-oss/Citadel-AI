import { describe, expect, it } from 'vitest';
import { MockModelProvider } from '@citadel/integrations/models';
import {
  MalformedModelResponseError,
  ModelProviderError,
  type GenerateParams,
  type GenerateResult,
  type ModelProvider,
  type ModelProviderCapabilities,
  type WebsiteFetchResult,
} from '@citadel/shared';
import { makeTestClient } from '../test-fixtures.js';
import { SeoAgent } from './seo-agent.js';

function makePage(overrides: Partial<WebsiteFetchResult> = {}): WebsiteFetchResult {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    redirected: false,
    statusCode: 200,
    ok: true,
    https: true,
    contentType: 'text/html',
    title: "Widget Installation in Coeur d'Alene | Test Client Co",
    metaDescription: "Local widget installation serving Coeur d'Alene, ID. Call now for a free estimate.",
    canonicalUrl: 'https://example.com/',
    metaRobots: 'index, follow',
    headings: [
      { level: 1, text: "Widget Installation in Coeur d'Alene" },
      { level: 2, text: 'Our Services' },
    ],
    h1Count: 1,
    h2Count: 1,
    wordCount: 400,
    textExcerpt:
      "Test Client Co proudly offers widget installation serving Coeur d'Alene, ID. Call now for a free estimate. We are licensed and insured. Call (208) 555-0142 today.",
    links: [{ href: 'https://example.com/contact', text: 'Contact Us', internal: true }],
    internalLinkCount: 1,
    imageCount: 1,
    imagesMissingAlt: 0,
    telLinks: [],
    mailtoLinks: [],
    formCount: 0,
    phoneNumberMatches: [],
    robotsTxt: { exists: true, blocksAll: false, content: 'User-agent: *\nDisallow:\n' },
    sitemap: { exists: true, url: 'https://example.com/sitemap.xml' },
    fetchedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

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
      keyword_opportunities: ['made up keyword'],
      recommendations: [
        { title: 'Fabricated finding', description: 'This cites an id that does not exist.', priority: 'high', evidence_refs: ['tech-999'] },
      ],
      summary: 'A summary.',
    };
    return { text: JSON.stringify(structured), structured, model: 'fake-model', provider: this.name, stopReason: 'end_turn' };
  }
}

describe('SeoAgent', () => {
  it('produces a full structured audit combining deterministic findings with LLM recommendations', async () => {
    const agent = new SeoAgent(new MockModelProvider());
    const client = makeTestClient();

    const result = await agent.run(
      { url: 'https://example.com/', page: makePage() },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-1' },
    );

    expect(result.url).toBe('https://example.com/');
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.technical.score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.onPage.issues)).toBe(true);
    expect(Array.isArray(result.evidence)).toBe(true);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.providerUsed).toBe('mock');
    // Every recommendation must cite a real evidence id from the catalog.
    const evidenceIds = new Set(result.evidence.map((e) => e.id));
    for (const rec of result.recommendations) {
      expect(rec.evidenceRefs.length).toBeGreaterThan(0);
      for (const ref of rec.evidenceRefs) {
        expect(evidenceIds.has(ref)).toBe(true);
      }
    }
  });

  it('drops a recommendation whose evidence id does not exist in the real catalog', async () => {
    const agent = new SeoAgent(new InventedEvidenceProvider());
    const client = makeTestClient();

    const result = await agent.run(
      { url: 'https://example.com/', page: makePage() },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-2' },
    );

    expect(result.recommendations.find((r) => r.title === 'Fabricated finding')).toBeUndefined();
  });

  it('throws MalformedModelResponseError when the model returns no structured output', async () => {
    const agent = new SeoAgent(new MalformedResponseProvider());
    const client = makeTestClient();

    await expect(
      agent.run({ url: 'https://example.com/', page: makePage() }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-3' }),
    ).rejects.toThrow(MalformedModelResponseError);
  });

  it('propagates a model provider failure rather than returning a fake success', async () => {
    const agent = new SeoAgent(new FailingProvider());
    const client = makeTestClient();

    await expect(
      agent.run({ url: 'https://example.com/', page: makePage() }, { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-4' }),
    ).rejects.toThrow(ModelProviderError);
  });

  it('honors a target service focus', async () => {
    const agent = new SeoAgent(new MockModelProvider());
    const client = makeTestClient();
    const page = makePage({ textExcerpt: 'We only talk about widget installation here, nothing else.' });

    const result = await agent.run(
      { url: 'https://example.com/', page, targetService: 'gutter cleaning' },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-5' },
    );

    expect(result.localSeo.issues.some((i) => i.code === 'TARGET_SERVICE_NOT_ON_PAGE')).toBe(true);
  });

  it('honors a target location focus', async () => {
    const agent = new SeoAgent(new MockModelProvider());
    const client = makeTestClient();
    const page = makePage({ textExcerpt: "We serve Coeur d'Alene only, nothing else." });

    const result = await agent.run(
      { url: 'https://example.com/', page, targetLocation: 'Post Falls' },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-6' },
    );

    expect(result.onPage.issues.some((i) => i.code === 'TARGET_LOCATION_NOT_ON_PAGE')).toBe(true);
  });

  it('reports missing client SEO/local data honestly instead of inventing it', async () => {
    const agent = new SeoAgent(new MockModelProvider());
    const client = makeTestClient({ seoProfile: null, serviceAreas: [] });

    const result = await agent.run(
      { url: 'https://example.com/', page: makePage() },
      { client, actor: { id: 'test', label: 'Test Actor' }, requestId: 'req-7' },
    );

    expect(result.localSeo.issues.some((i) => i.code === 'NO_LOCAL_DATA_ON_FILE')).toBe(true);
    expect(result.evidence.some((e) => e.type === 'client_knowledge' && e.description.includes('No SEO profile on file'))).toBe(true);
  });
});
