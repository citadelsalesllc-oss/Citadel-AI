import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@citadel/database';
import { loadEnv } from '../env.js';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';

/**
 * POST /clients/:clientId/ai/generate — the Phase 3 structured pipeline:
 * USER REQUEST -> ORCHESTRATOR -> CLIENT CONTEXT -> CONTENT AGENT -> AI
 * MODEL -> BRAND/FACTUAL QA -> SAVE -> RETURN RESULT. Runs against the
 * mock model provider (deterministic, no real API call — see
 * MODEL_PROVIDER=mock forced in tests/setup-env.ts) and a real Postgres
 * test database.
 */
describe('POST /clients/:clientId/ai/generate', () => {
  const env = loadEnv();
  const container = buildContainer(env);
  const app = createApp(env, container);

  async function createClient(overrides: Record<string, unknown> = {}) {
    const slug = `ai-generate-${randomUUID()}`;
    const res = await request(app)
      .post('/clients')
      .send({ slug, companyName: 'AI Generate Test Co', ...overrides })
      .expect(201);
    return { slug, client: res.body.client as { id: string } };
  }

  it('generates a Facebook post end to end and saves it as DRAFT when QA passes', async () => {
    const { slug, client } = await createClient();
    await request(app)
      .post(`/clients/${slug}/services`)
      .send({ serviceName: 'Septic System Installation' })
      .expect(201);

    const res = await request(app)
      .post(`/clients/${slug}/ai/generate`)
      .send({ task: 'create_social_post', platform: 'FACEBOOK', topic: 'a septic installation' })
      .expect(200);

    expect(res.body.content.platform).toBe('FACEBOOK');
    expect(typeof res.body.content.content).toBe('string');
    expect(res.body.content.content.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.content.hashtags)).toBe(true);
    expect(Array.isArray(res.body.content.seo_keywords_used)).toBe(true);
    expect(Array.isArray(res.body.content.notes)).toBe(true);

    expect(res.body.qaResult.passed).toBe(true);
    expect(res.body.qaResult.issues).toEqual([]);

    expect(res.body.status).toBe('DRAFT');
    expect(typeof res.body.contentId).toBe('string');
    expect(res.body.agentUsed).toBe('create-social-post');
    expect(res.body.modelProvider.name).toBe('mock');
    expect(typeof res.body.modelProvider.model).toBe('string');

    // Saved for real — fetchable via the ordinary content endpoints too.
    const saved = await request(app).get(`/content/${res.body.contentId}`).query({ clientIdOrSlug: slug }).expect(200);
    expect(saved.body.contentItem.status).toBe('DRAFT');
    expect(saved.body.contentItem.body).toBe(res.body.content.content);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('saves as REVISION_REQUIRED (never DRAFT, never silently dropped) when Brand QA fails', async () => {
    const { slug, client } = await createClient();
    // The mock provider's deterministic template always includes the word
    // "latest" ("here's the latest from {company}") — forbidding it
    // guarantees a deterministic QA failure without needing a real model.
    await request(app).put(`/clients/${slug}/brand-profile`).send({ forbiddenPhrases: ['latest'] }).expect(200);

    const res = await request(app)
      .post(`/clients/${slug}/ai/generate`)
      .send({ task: 'create_social_post', platform: 'FACEBOOK', topic: 'a septic installation' })
      .expect(200);

    expect(res.body.qaResult.passed).toBe(false);
    expect(res.body.qaResult.issues.some((i: { code: string }) => i.code === 'FORBIDDEN_PHRASE')).toBe(true);
    expect(res.body.status).toBe('REVISION_REQUIRED');

    // It was still saved — QA failure never means the generation vanishes.
    const saved = await request(app).get(`/content/${res.body.contentId}`).query({ clientIdOrSlug: slug }).expect(200);
    expect(saved.body.contentItem.status).toBe('REVISION_REQUIRED');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('applies each client\'s own brand rules — the same topic passes for one client and fails for another', async () => {
    const strict = await createClient({ companyName: 'Strict Rules Co' });
    const relaxed = await createClient({ companyName: 'Relaxed Rules Co' });
    await request(app).put(`/clients/${strict.slug}/brand-profile`).send({ forbiddenPhrases: ['latest'] }).expect(200);

    const strictRes = await request(app)
      .post(`/clients/${strict.slug}/ai/generate`)
      .send({ task: 'create_social_post', platform: 'FACEBOOK', topic: 'a septic installation' })
      .expect(200);
    const relaxedRes = await request(app)
      .post(`/clients/${relaxed.slug}/ai/generate`)
      .send({ task: 'create_social_post', platform: 'FACEBOOK', topic: 'a septic installation' })
      .expect(200);

    expect(strictRes.body.status).toBe('REVISION_REQUIRED');
    expect(relaxedRes.body.status).toBe('DRAFT');

    await prisma.client.deleteMany({ where: { id: { in: [strict.client.id, relaxed.client.id] } } });
  });

  it('returns 404 for an invalid client instead of inventing one', async () => {
    await request(app)
      .post('/clients/does-not-exist-xyz/ai/generate')
      .send({ task: 'create_social_post', platform: 'FACEBOOK', topic: 'anything' })
      .expect(404);
  });

  it('rejects a malformed request body with 400', async () => {
    const { slug, client } = await createClient();
    await request(app).post(`/clients/${slug}/ai/generate`).send({ task: 'create_social_post' }).expect(400);
    await prisma.client.delete({ where: { id: client.id } });
  });

  it('reports an unsupported task honestly with a structured error, not a fabricated result', async () => {
    const { slug, client } = await createClient();
    const res = await request(app)
      .post(`/clients/${slug}/ai/generate`)
      .send({ task: 'website_audit', platform: 'FACEBOOK', topic: 'anything' })
      .expect(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    await prisma.client.delete({ where: { id: client.id } });
  });
});
