import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@citadel/database';
import { loadEnv } from '../env.js';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';

/**
 * POST /clients/:clientId/ai/reviews/:reviewId/analyze and .../respond —
 * the Phase 5 structured pipeline: REVIEW DATA -> REVIEW ANALYSIS ->
 * CLIENT CONTEXT -> REVIEW AGENT -> AI MODEL -> BRAND QA -> SAVE RESPONSE
 * AS DRAFT -> RETURN RESULT. Runs against the mock model provider and mock
 * review provider (both default in tests/setup-env.ts and env.ts) and a
 * real Postgres test database.
 */
describe('Review Intelligence endpoints', () => {
  const env = loadEnv();
  const container = buildContainer(env);
  const app = createApp(env, container);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function createClient(overrides: Record<string, unknown> = {}) {
    const slug = `reviews-${randomUUID()}`;
    const res = await request(app)
      .post('/clients')
      .send({ slug, companyName: 'Reviews Test Co', phone: '(208) 555-0142', ...overrides })
      .expect(201);
    return { slug, client: res.body.client as { id: string } };
  }

  async function syncReviews(slug: string) {
    const res = await request(app).post(`/clients/${slug}/reviews/sync`).expect(201);
    return res.body.reviews as { id: string; externalId: string; rating: number; reviewText: string }[];
  }

  it('review_sync ingests the mock fixture reviews', async () => {
    const { slug, client } = await createClient();
    const reviews = await syncReviews(slug);
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.every((r) => r.externalId.startsWith('mock-review-'))).toBe(true);

    const listRes = await request(app).get(`/clients/${slug}/reviews`).expect(200);
    expect(listRes.body.reviews).toHaveLength(reviews.length);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('analyzes a positive review and reports a positive classification', async () => {
    const { slug, client } = await createClient();
    const reviews = await syncReviews(slug);
    const fiveStar = reviews.find((r) => r.rating === 5)!;

    const res = await request(app).post(`/clients/${slug}/ai/reviews/${fiveStar.id}/analyze`).send({}).expect(200);

    expect(res.body.analysis.rating).toBe(5);
    expect(res.body.analysis.classification).toBe('positive');
    expect(Array.isArray(res.body.analysis.positive_points)).toBe(true);
    expect(Array.isArray(res.body.analysis.evidence)).toBe(true);
    expect(res.body.reviewId).toBe(fiveStar.id);
    expect(res.body.agentUsed).toBe('review-analyze');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('analyzes a negative review and reports a negative classification', async () => {
    const { slug, client } = await createClient();
    const reviews = await syncReviews(slug);
    const twoStar = reviews.find((r) => r.rating === 2)!;

    const res = await request(app).post(`/clients/${slug}/ai/reviews/${twoStar.id}/analyze`).send({}).expect(200);

    expect(res.body.analysis.classification).toBe('negative');
    expect(res.body.analysis.negative_points.length).toBeGreaterThan(0);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('flags escalation for the serious 1-star complaint review', async () => {
    const { slug, client } = await createClient();
    const reviews = await syncReviews(slug);
    const oneStar = reviews.find((r) => r.rating === 1)!;

    const res = await request(app).post(`/clients/${slug}/ai/reviews/${oneStar.id}/analyze`).send({}).expect(200);

    expect(res.body.analysis.escalation_needed).toBe(true);
    expect(res.body.analysis.concerns.length).toBeGreaterThan(0);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('drafts a response to a positive review and saves it as DRAFT', async () => {
    const { slug, client } = await createClient();
    const reviews = await syncReviews(slug);
    const fiveStar = reviews.find((r) => r.rating === 5)!;

    const res = await request(app).post(`/clients/${slug}/ai/reviews/${fiveStar.id}/respond`).send({}).expect(200);

    expect(res.body.response.response.length).toBeGreaterThan(0);
    expect(res.body.qaResult.passed).toBe(true);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.escalationNeeded).toBe(false);
    expect(res.body.modelProvider.name).toBe('mock');

    const saved = await request(app).get(`/clients/${slug}/reviews/${fiveStar.id}`).expect(200);
    expect(saved.body.review.responseStatus).toBe('DRAFT');
    expect(saved.body.review.responseText).toBe(res.body.response.response);
    expect(saved.body.responseVersions).toHaveLength(1);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('saves as REVISION_REQUIRED (never silently dropped) when Brand QA fails', async () => {
    const { slug, client } = await createClient();
    // The mock provider's deterministic positive-review template always
    // includes the word "kind" ("...the kind words!") — forbidding it
    // guarantees a deterministic QA failure without needing a real model.
    await request(app).put(`/clients/${slug}/brand-profile`).send({ forbiddenPhrases: ['kind'] }).expect(200);
    const reviews = await syncReviews(slug);
    const fiveStar = reviews.find((r) => r.rating === 5)!;

    const res = await request(app).post(`/clients/${slug}/ai/reviews/${fiveStar.id}/respond`).send({}).expect(200);

    expect(res.body.qaResult.passed).toBe(false);
    expect(res.body.qaResult.issues.some((i: { code: string }) => i.code === 'FORBIDDEN_PHRASE')).toBe(true);
    expect(res.body.status).toBe('REVISION_REQUIRED');

    const saved = await request(app).get(`/clients/${slug}/reviews/${fiveStar.id}`).expect(200);
    expect(saved.body.review.responseStatus).toBe('REVISION_REQUIRED');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('accumulates response history across multiple respond calls without overwriting prior versions', async () => {
    const { slug, client } = await createClient();
    const reviews = await syncReviews(slug);
    const threeStar = reviews.find((r) => r.rating === 3)!;

    await request(app).post(`/clients/${slug}/ai/reviews/${threeStar.id}/respond`).send({}).expect(200);
    await request(app).post(`/clients/${slug}/ai/reviews/${threeStar.id}/respond`).send({ instructions: 'be brief' }).expect(200);

    const saved = await request(app).get(`/clients/${slug}/reviews/${threeStar.id}`).expect(200);
    expect(saved.body.responseVersions).toHaveLength(2);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('returns 404 for an invalid client instead of inventing one', async () => {
    await request(app).post('/clients/does-not-exist-xyz/ai/reviews/some-review/analyze').send({}).expect(404);
    await request(app).post('/clients/does-not-exist-xyz/ai/reviews/some-review/respond').send({}).expect(404);
  });

  it('returns 404 for an invalid review id', async () => {
    const { slug, client } = await createClient();
    await request(app).post(`/clients/${slug}/ai/reviews/does-not-exist/analyze`).send({}).expect(404);
    await request(app).post(`/clients/${slug}/ai/reviews/does-not-exist/respond`).send({}).expect(404);
    await prisma.client.delete({ where: { id: client.id } });
  });

  it('keeps reviews isolated between clients — Client B cannot analyze or respond to Client A\'s review', async () => {
    const clientA = await createClient({ companyName: 'Client A Reviews' });
    const clientB = await createClient({ companyName: 'Client B Reviews' });
    const reviewsA = await syncReviews(clientA.slug);
    const reviewA = reviewsA[0]!;

    await request(app).post(`/clients/${clientB.slug}/ai/reviews/${reviewA.id}/analyze`).send({}).expect(404);
    await request(app).post(`/clients/${clientB.slug}/ai/reviews/${reviewA.id}/respond`).send({}).expect(404);

    const listB = await request(app).get(`/clients/${clientB.slug}/reviews`).expect(200);
    expect(listB.body.reviews).toEqual([]);

    await prisma.client.deleteMany({ where: { id: { in: [clientA.client.id, clientB.client.id] } } });
  });

  it('does not regress the existing Facebook content-generation workflow', async () => {
    const { slug, client } = await createClient();
    await request(app).post(`/clients/${slug}/services`).send({ serviceName: 'Septic Tank Installation' }).expect(201);

    const res = await request(app)
      .post(`/clients/${slug}/ai/generate`)
      .send({ task: 'create_social_post', platform: 'FACEBOOK', topic: 'a septic installation' })
      .expect(200);
    expect(res.body.status).toBe('DRAFT');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('does not regress the existing SEO audit workflow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
        if (url.endsWith('/sitemap.xml')) return new Response('', { status: 404 });
        return new Response('<html><head><title>Test</title></head><body><h1>Test</h1></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }),
    );
    const { slug, client } = await createClient();

    const res = await request(app).post(`/clients/${slug}/ai/seo-audit`).send({ url: 'https://example.com/' }).expect(200);
    expect(res.body.audit.overall_score).toBeGreaterThanOrEqual(0);

    await prisma.client.delete({ where: { id: client.id } });
  });
});
