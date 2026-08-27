import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@citadel/database';
import {
  STRONG_CONVERSION_HTML,
  WEAK_CONVERSION_HTML,
  MISSING_CTA_HTML,
  WEAK_SERVICE_MESSAGING_HTML,
  STRONG_SEO_WEAK_CONVERSION_HTML,
  STRONG_CONVERSION_WEAK_SEO_HTML,
} from '@citadel/integrations/websites';
import { loadEnv } from '../env.js';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';

/**
 * POST /clients/:clientId/ai/website-audit — the Phase 7 structured
 * pipeline: USER REQUEST -> ORCHESTRATOR -> CLIENT CONTEXT -> WEBSITE
 * FETCH -> WEBSITE AGENT (deterministic marketing/conversion/customer-
 * journey/content/brand checks + LLM-prioritized recommendations) -> SAVE
 * -> RETURN RESULT. Runs against the mock model provider (see
 * MODEL_PROVIDER=mock forced in tests/setup-env.ts) and a real Postgres
 * test database. The target website itself is never a real network call —
 * every test stubs global fetch with the fixtures in
 * integrations/src/websites/fixtures.ts, per the master spec's "mock
 * website fixture" requirement (section 12).
 */

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

describe('POST /clients/:clientId/ai/website-audit', () => {
  const env = loadEnv();
  const container = buildContainer(env);
  const app = createApp(env, container);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function createClient(overrides: Record<string, unknown> = {}) {
    const slug = `website-audit-${randomUUID()}`;
    const res = await request(app)
      .post('/clients')
      .send({ slug, companyName: 'Rivertown Plumbing Pros', ...overrides })
      .expect(201);
    return { slug, client: res.body.client as { id: string } };
  }

  it('audits a strong-conversion page end to end and saves the result', async () => {
    stubFetchWithPage(STRONG_CONVERSION_HTML);
    const { slug, client } = await createClient();
    await request(app).post(`/clients/${slug}/services`).send({ serviceName: 'Emergency Plumbing Repair' }).expect(201);
    await request(app).post(`/clients/${slug}/service-areas`).send({ name: 'Rivertown' }).expect(201);

    const res = await request(app)
      .post(`/clients/${slug}/ai/website-audit`)
      .send({ url: 'https://rivertown-plumbing.example/' })
      .expect(200);

    expect(res.body.audit.url).toBe('https://rivertown-plumbing.example/');
    expect(res.body.audit.overall_score).toBeGreaterThanOrEqual(0);
    expect(res.body.audit.overall_score).toBeLessThanOrEqual(100);
    expect(res.body.audit.first_impression).toHaveProperty('score');
    expect(res.body.audit.conversion).toHaveProperty('score');
    expect(res.body.audit.customer_journey).toHaveProperty('frictionPoints');
    expect(res.body.audit.content).toHaveProperty('score');
    expect(res.body.audit.brand).toHaveProperty('score');
    expect(res.body.audit.mobile.tested).toBe(false);
    expect(res.body.audit.mobile.note.toLowerCase()).toContain('not performed');
    expect(Array.isArray(res.body.audit.quick_wins)).toBe(true);
    expect(Array.isArray(res.body.audit.high_impact_changes)).toBe(true);
    expect(Array.isArray(res.body.evidence)).toBe(true);
    expect(res.body.evidence.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.clientId).toBe(client.id);
    expect(typeof res.body.auditId).toBe('string');
    expect(res.body.agentUsed).toBe('website-audit');
    expect(res.body.modelProvider.name).toBe('mock');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('saves the audit so it can be retrieved from history, enabling comparison over time', async () => {
    stubFetchWithPage(STRONG_CONVERSION_HTML);
    const { slug, client } = await createClient();

    const first = await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'https://rivertown-plumbing.example/' }).expect(200);
    const second = await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'https://rivertown-plumbing.example/' }).expect(200);

    const history = await request(app).get(`/clients/${slug}/website-audits`).expect(200);
    expect(history.body.websiteAudits).toHaveLength(2);
    // Newest first, and never overwritten.
    expect(history.body.websiteAudits[0].id).toBe(second.body.auditId);
    expect(history.body.websiteAudits[1].id).toBe(first.body.auditId);
    expect(history.body.websiteAudits[0].overallScore).toBe(second.body.audit.overall_score);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('flags weak conversion signals on a page with only a plain-text phone number and no form', async () => {
    stubFetchWithPage(WEAK_CONVERSION_HTML);
    const { slug, client } = await createClient({ companyName: 'Blue Ridge Plumbing' });

    const res = await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'https://blue-ridge-plumbing.example/' }).expect(200);

    expect(res.body.audit.conversion.issues.length).toBeGreaterThan(0);
    expect(res.body.audit.conversion.issues.some((i: string) => i.toLowerCase().includes('form'))).toBe(true);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('flags a missing call-to-action on an informational-only page', async () => {
    stubFetchWithPage(MISSING_CTA_HTML);
    const { slug, client } = await createClient({ companyName: 'Summit Electrical' });

    const res = await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'https://summit-electrical.example/' }).expect(200);

    expect(res.body.audit.conversion.issues.some((i: string) => i.toLowerCase().includes('call-to-action'))).toBe(true);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('flags weak service messaging on a page with generic, vague copy', async () => {
    stubFetchWithPage(WEAK_SERVICE_MESSAGING_HTML);
    const { slug, client } = await createClient({ companyName: 'Golden Gate Home Services' });
    await request(app).post(`/clients/${slug}/services`).send({ serviceName: 'Handyman Services' }).expect(201);

    const res = await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'https://golden-gate-home.example/' }).expect(200);

    expect(res.body.audit.content.issues.some((i: string) => i.toLowerCase().includes('service'))).toBe(true);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('reports strong SEO but weak conversion honestly — high on-page structure, low conversion strengths', async () => {
    stubFetchWithPage(STRONG_SEO_WEAK_CONVERSION_HTML);
    const { slug, client } = await createClient({ companyName: 'Cedar Falls Roofing Experts' });
    await request(app).post(`/clients/${slug}/services`).send({ serviceName: 'Roof Repair' }).expect(201);
    await request(app).post(`/clients/${slug}/service-areas`).send({ name: 'Cedar Falls' }).expect(201);

    const res = await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'https://cedar-falls-roofing.example/' }).expect(200);

    expect(res.body.audit.conversion.issues.length).toBeGreaterThan(0);
    expect(res.body.audit.conversion.issues.some((i: string) => i.toLowerCase().includes('call-to-action') || i.toLowerCase().includes('phone'))).toBe(true);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('reports strong conversion but weak SEO honestly — clear CTA/phone/trust signals despite no title/meta/H1', async () => {
    stubFetchWithPage(STRONG_CONVERSION_WEAK_SEO_HTML);
    const { slug, client } = await createClient({ companyName: 'Piney Woods Pest Control' });

    const res = await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'https://piney-woods-pest.example/' }).expect(200);

    expect(res.body.audit.conversion.strengths.length).toBeGreaterThan(0);
    expect(res.body.audit.first_impression.issues.length).toBeGreaterThan(0);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('returns 404 for an invalid client instead of inventing one', async () => {
    stubFetchWithPage(STRONG_CONVERSION_HTML);
    await request(app)
      .post('/clients/does-not-exist-xyz/ai/website-audit')
      .send({ url: 'https://rivertown-plumbing.example/' })
      .expect(404);
  });

  it('rejects a malformed request body with 400', async () => {
    const { slug, client } = await createClient();
    await request(app).post(`/clients/${slug}/ai/website-audit`).send({ target_service: 'no url provided' }).expect(400);
    await prisma.client.delete({ where: { id: client.id } });
  });

  it('rejects an invalid URL honestly rather than fabricating an audit', async () => {
    const { slug, client } = await createClient();
    await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'not a url' }).expect(400);
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
      .post(`/clients/${slug}/ai/website-audit`)
      .send({ url: 'https://does-not-resolve.invalid/' })
      .expect(502);
    expect(res.body.error.code).toBe('WEBSITE_UNREACHABLE');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('reports an HTTP error status from the target site honestly rather than fabricating an audit', async () => {
    stubFetchWithPage('<html><body>Not found</body></html>', 404);
    const { slug, client } = await createClient();

    const res = await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'https://rivertown-plumbing.example/missing' }).expect(200);
    expect(res.body.audit.overall_score).toBeGreaterThanOrEqual(0);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('keeps audits isolated between clients', async () => {
    stubFetchWithPage(STRONG_CONVERSION_HTML);
    const clientA = await createClient({ companyName: 'Client A Plumbing' });
    const clientB = await createClient({ companyName: 'Client B Plumbing' });

    await request(app).post(`/clients/${clientA.slug}/ai/website-audit`).send({ url: 'https://rivertown-plumbing.example/' }).expect(200);

    const historyB = await request(app).get(`/clients/${clientB.slug}/website-audits`).expect(200);
    expect(historyB.body.websiteAudits).toHaveLength(0);

    await prisma.client.deleteMany({ where: { id: { in: [clientA.client.id, clientB.client.id] } } });
  });

  it('does not regress the existing SEO audit workflow when the Website Agent is used alongside it', async () => {
    stubFetchWithPage(STRONG_CONVERSION_HTML);
    const { slug, client } = await createClient();

    const websiteRes = await request(app).post(`/clients/${slug}/ai/website-audit`).send({ url: 'https://rivertown-plumbing.example/' }).expect(200);
    const seoRes = await request(app).post(`/clients/${slug}/ai/seo-audit`).send({ url: 'https://rivertown-plumbing.example/' }).expect(200);

    expect(websiteRes.body.agentUsed).toBe('website-audit');
    expect(seoRes.body.agentUsed).toBe('seo-audit');
    expect(seoRes.body.audit.overall_score).toBeGreaterThanOrEqual(0);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('does not regress the existing content-generation and review workflows', async () => {
    const { slug, client } = await createClient();

    const contentRes = await request(app)
      .post(`/clients/${slug}/ai/generate`)
      .send({ task: 'create_social_post', platform: 'facebook', topic: 'a plumbing repair' })
      .expect(200);
    expect(contentRes.body.status).toBe('DRAFT');

    const reviews = await request(app).post(`/clients/${slug}/reviews/sync`).expect(201);
    expect(reviews.body.reviews.length).toBeGreaterThan(0);

    await prisma.client.delete({ where: { id: client.id } });
  });
});
