import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@citadel/database';
import { loadEnv } from '../env.js';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';

/**
 * POST /clients/:clientId/ai/seo-audit — the Phase 4 structured pipeline:
 * USER REQUEST -> ORCHESTRATOR -> CLIENT CONTEXT -> WEBSITE FETCH -> SEO
 * AGENT (deterministic checks + LLM-prioritized recommendations) -> SAVE
 * -> RETURN RESULT. Runs against the mock model provider (see
 * MODEL_PROVIDER=mock forced in tests/setup-env.ts) and a real Postgres
 * test database. The target website itself is never a real network call —
 * every test stubs global fetch with a realistic local-service-business
 * page fixture, per the master spec's "mock website fixture" requirement.
 */

/** A realistic local septic-service business homepage — used only in tests, never real CDA Septic Systems data (see master spec section 12). */
const GOOD_PAGE_HTML = `<!doctype html>
<html>
<head>
  <title>Septic Tank Installation &amp; Pumping | Test Septic Co</title>
  <meta name="description" content="Test Septic Co installs and pumps septic systems serving Rivertown, ST. Call now for a free estimate.">
  <link rel="canonical" href="https://test-septic.example/">
  <meta name="robots" content="index, follow">
</head>
<body>
  <h1>Septic Tank Installation in Rivertown</h1>
  <h2>Our Services</h2>
  <p>Test Septic Co proudly offers septic tank installation and pumping serving Rivertown, ST. We are licensed and insured.
  Call now for a free estimate. Call (208) 555-0199 today.</p>
  <a href="/contact">Contact Us</a>
  <img src="/truck.jpg" alt="Septic service truck">
</body>
</html>`;

function stubFetchWithPage(html: string, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow:\n', { status: 200, headers: { 'content-type': 'text/plain' } });
      if (url.endsWith('/sitemap.xml')) return new Response('', { status: 404 });
      return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }),
  );
}

describe('POST /clients/:clientId/ai/seo-audit', () => {
  const env = loadEnv();
  const container = buildContainer(env);
  const app = createApp(env, container);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function createClient(overrides: Record<string, unknown> = {}) {
    const slug = `seo-audit-${randomUUID()}`;
    const res = await request(app)
      .post('/clients')
      .send({ slug, companyName: 'Test Septic Co', ...overrides })
      .expect(201);
    return { slug, client: res.body.client as { id: string } };
  }

  it('audits a fetched page end to end and saves the result', async () => {
    stubFetchWithPage(GOOD_PAGE_HTML);
    const { slug, client } = await createClient();
    await request(app).post(`/clients/${slug}/services`).send({ serviceName: 'Septic Tank Installation' }).expect(201);
    await request(app).post(`/clients/${slug}/service-areas`).send({ name: 'Rivertown' }).expect(201);

    const res = await request(app)
      .post(`/clients/${slug}/ai/seo-audit`)
      .send({ url: 'https://test-septic.example/' })
      .expect(200);

    expect(res.body.audit.url).toBe('https://test-septic.example/');
    expect(res.body.audit.overall_score).toBeGreaterThanOrEqual(0);
    expect(res.body.audit.overall_score).toBeLessThanOrEqual(100);
    expect(res.body.audit.technical).toHaveProperty('score');
    expect(res.body.audit.on_page).toHaveProperty('issues');
    expect(res.body.audit.local_seo).toHaveProperty('issues');
    expect(res.body.audit.conversion).toHaveProperty('issues');
    expect(Array.isArray(res.body.evidence)).toBe(true);
    expect(res.body.evidence.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.clientId).toBe(client.id);
    expect(typeof res.body.auditId).toBe('string');
    expect(res.body.agentUsed).toBe('seo-audit');
    expect(res.body.modelProvider.name).toBe('mock');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('saves the audit so it can be retrieved from history, enabling comparison over time', async () => {
    stubFetchWithPage(GOOD_PAGE_HTML);
    const { slug, client } = await createClient();

    const first = await request(app).post(`/clients/${slug}/ai/seo-audit`).send({ url: 'https://test-septic.example/' }).expect(200);
    const second = await request(app).post(`/clients/${slug}/ai/seo-audit`).send({ url: 'https://test-septic.example/' }).expect(200);

    const history = await request(app).get(`/clients/${slug}/seo-audits`).expect(200);
    expect(history.body.seoAudits).toHaveLength(2);
    // Newest first.
    expect(history.body.seoAudits[0].id).toBe(second.body.auditId);
    expect(history.body.seoAudits[1].id).toBe(first.body.auditId);
    expect(history.body.seoAudits[0].overallScore).toBe(second.body.audit.overall_score);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('flags real technical issues on a poorly-optimized page rather than a clean report', async () => {
    stubFetchWithPage('<html><body><p>No title, no meta description, no H1 here.</p></body></html>');
    const { slug, client } = await createClient();

    const res = await request(app).post(`/clients/${slug}/ai/seo-audit`).send({ url: 'https://test-septic.example/' }).expect(200);

    const technicalCodes = res.body.audit.technical.issues.map((i: { code: string }) => i.code);
    expect(technicalCodes).toContain('MISSING_TITLE');
    expect(technicalCodes).toContain('MISSING_META_DESCRIPTION');
    expect(technicalCodes).toContain('MISSING_H1');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('returns 404 for an invalid client instead of inventing one', async () => {
    stubFetchWithPage(GOOD_PAGE_HTML);
    await request(app)
      .post('/clients/does-not-exist-xyz/ai/seo-audit')
      .send({ url: 'https://test-septic.example/' })
      .expect(404);
  });

  it('rejects a malformed request body with 400', async () => {
    const { slug, client } = await createClient();
    await request(app).post(`/clients/${slug}/ai/seo-audit`).send({ target_service: 'no url provided' }).expect(400);
    await prisma.client.delete({ where: { id: client.id } });
  });

  it('reports an unreachable website honestly instead of fabricating an audit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed: ENOTFOUND');
      }),
    );
    const { slug, client } = await createClient();

    const res = await request(app)
      .post(`/clients/${slug}/ai/seo-audit`)
      .send({ url: 'https://does-not-resolve.invalid/' })
      .expect(502);
    expect(res.body.error.code).toBe('WEBSITE_UNREACHABLE');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('keeps audits isolated between clients', async () => {
    stubFetchWithPage(GOOD_PAGE_HTML);
    const clientA = await createClient({ companyName: 'Client A Septic' });
    const clientB = await createClient({ companyName: 'Client B Septic' });

    await request(app).post(`/clients/${clientA.slug}/ai/seo-audit`).send({ url: 'https://test-septic.example/' }).expect(200);

    const historyB = await request(app).get(`/clients/${clientB.slug}/seo-audits`).expect(200);
    expect(historyB.body.seoAudits).toHaveLength(0);

    await prisma.client.deleteMany({ where: { id: { in: [clientA.client.id, clientB.client.id] } } });
  });
});
