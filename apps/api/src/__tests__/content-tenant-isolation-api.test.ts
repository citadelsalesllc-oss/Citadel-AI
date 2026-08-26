import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@citadel/database';
import { loadEnv } from '../env.js';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';

/**
 * API-layer proof of the same fix verified at the repository and tool
 * layers: every content-lifecycle route requires `clientIdOrSlug` and must
 * return 404 (not the record, not a 500) when it doesn't match the content
 * item's real owner. Covers both the read path (GET) and every
 * write/action path (submit-for-review, approve, reject, request-revision,
 * publish).
 */
describe('content lifecycle API: tenant isolation', () => {
  const env = loadEnv();
  const container = buildContainer(env);
  const app = createApp(env, container);

  async function createClient(companyName: string) {
    const slug = `content-iso-api-${randomUUID()}`;
    const res = await request(app).post('/clients').send({ slug, companyName }).expect(201);
    return { slug, client: res.body.client as { id: string } };
  }

  async function createDraft(slug: string, body: string) {
    const res = await request(app)
      .post(`/clients/${slug}/content`)
      .send({ type: 'SOCIAL_POST', body })
      .expect(201);
    return res.body.contentItem.id as string;
  }

  it("GET /content/:id returns 404 when the caller declares a different client than the content's real owner", async () => {
    const a = await createClient('Content Iso API A');
    const b = await createClient('Content Iso API B');
    const contentId = await createDraft(a.slug, "A's private content");

    await request(app).get(`/content/${contentId}`).query({ clientIdOrSlug: a.slug }).expect(200);
    await request(app).get(`/content/${contentId}`).query({ clientIdOrSlug: b.slug }).expect(404);

    await prisma.client.deleteMany({ where: { id: { in: [a.client.id, b.client.id] } } });
  });

  it('every write/action route returns 404 (not 200, not 500) for a cross-client attempt', async () => {
    const a = await createClient('Content Iso API A2');
    const b = await createClient('Content Iso API B2');
    const contentId = await createDraft(a.slug, "A's private content 2");

    await request(app)
      .post(`/content/${contentId}/submit-for-review`)
      .send({ clientIdOrSlug: b.slug })
      .expect(404);

    // Confirm it's genuinely still DRAFT via the legitimate owner.
    let current = await request(app).get(`/content/${contentId}`).query({ clientIdOrSlug: a.slug }).expect(200);
    expect(current.body.contentItem.status).toBe('DRAFT');

    // Move it to REVIEW as the real owner so approve/reject/request-revision are reachable.
    await request(app).post(`/content/${contentId}/submit-for-review`).send({ clientIdOrSlug: a.slug }).expect(200);

    await request(app)
      .post(`/content/${contentId}/approve`)
      .send({ clientIdOrSlug: b.slug, reviewer: 'Attacker' })
      .expect(404);

    await request(app)
      .post(`/content/${contentId}/reject`)
      .send({ clientIdOrSlug: b.slug, reviewer: 'Attacker', reason: 'malicious' })
      .expect(404);

    await request(app)
      .post(`/content/${contentId}/request-revision`)
      .send({ clientIdOrSlug: b.slug, reviewer: 'Attacker', reason: 'malicious' })
      .expect(404);

    current = await request(app).get(`/content/${contentId}`).query({ clientIdOrSlug: a.slug }).expect(200);
    expect(current.body.contentItem.status).toBe('REVIEW');

    // Approve as the real owner, then confirm cross-client publish is also blocked.
    await request(app)
      .post(`/content/${contentId}/approve`)
      .send({ clientIdOrSlug: a.slug, reviewer: 'Real Reviewer' })
      .expect(200);

    await request(app)
      .post(`/content/${contentId}/publish`)
      .send({ clientIdOrSlug: b.slug, platform: 'facebook' })
      .expect(404);

    current = await request(app).get(`/content/${contentId}`).query({ clientIdOrSlug: a.slug }).expect(200);
    expect(current.body.contentItem.status).toBe('APPROVED');

    // The legitimate owner can still complete the flow — the fix doesn't break normal use.
    const publishRes = await request(app)
      .post(`/content/${contentId}/publish`)
      .send({ clientIdOrSlug: a.slug, platform: 'facebook' })
      .expect(200);
    expect(publishRes.body.contentItem.status).toBe('PUBLISHED');

    await prisma.client.deleteMany({ where: { id: { in: [a.client.id, b.client.id] } } });
  });

  it('GET /content/:id requires clientIdOrSlug (400, not an information leak)', async () => {
    const a = await createClient('Content Iso API C');
    const contentId = await createDraft(a.slug, 'some content');

    await request(app).get(`/content/${contentId}`).expect(400);

    await prisma.client.deleteMany({ where: { id: a.client.id } });
  });
});
