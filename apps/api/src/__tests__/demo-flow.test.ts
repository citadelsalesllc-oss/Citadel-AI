import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@citadel/database';
import { loadEnv } from '../env.js';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';

/**
 * End-to-end walkthrough of the MVP demo scenario from the master spec:
 * create a client via the knowledge-management API (core record, then
 * services/service-area/brand-profile as separate calls — reflecting how a
 * real client actually gets onboarded in Phase 2's normalized model), ask
 * the orchestrator to create a Facebook post, verify it's routed to the
 * Content Agent with that knowledge, passes Brand QA, is saved as DRAFT,
 * and can be approved and (mock-)published.
 */
describe('CDA Septic Systems demo flow', () => {
  const env = loadEnv();
  const container = buildContainer(env);
  const app = createApp(env, container);

  it('onboards a client through the knowledge API, generates on-brand content, and drives it through approval to publish', async () => {
    const slug = `cda-septic-systems-e2e-${randomUUID()}`;

    const createRes = await request(app)
      .post('/clients')
      .send({ slug, companyName: 'CDA Septic Systems', industry: 'Septic & Wastewater Services', phone: '(208) 555-0142' })
      .expect(201);
    const client = createRes.body.client;
    expect(client.companyName).toBe('CDA Septic Systems');

    await request(app)
      .post(`/clients/${slug}/services`)
      .send({ serviceName: 'Septic System Installation', description: 'New and replacement septic installs.' })
      .expect(201);

    await request(app)
      .post(`/clients/${slug}/service-areas`)
      .send({ name: "Coeur d'Alene", city: "Coeur d'Alene", state: 'ID' })
      .expect(201);

    await request(app)
      .put(`/clients/${slug}/brand-profile`)
      .send({
        brandVoice: 'Straightforward, trustworthy, locally-rooted.',
        forbiddenPhrases: ['best in the world', 'guaranteed for life'],
        preferredPhrases: ['locally owned and operated'],
      })
      .expect(200);

    // The knowledge-retrieval endpoint reflects everything just added.
    const contextRes = await request(app).get(`/clients/${slug}/context`).expect(200);
    expect(contextRes.body.context.services).toHaveLength(1);
    expect(contextRes.body.context.serviceAreas).toHaveLength(1);
    expect(contextRes.body.context.brandProfile.brandVoice).toBe('Straightforward, trustworthy, locally-rooted.');

    const orchestratorRes = await request(app)
      .post('/orchestrator/requests')
      .set('x-actor-label', 'Demo User')
      .send({ clientIdOrSlug: slug, instruction: 'Create a Facebook post about a septic installation.' })
      .expect(200);

    const result = orchestratorRes.body.result;
    expect(result.status).toBe('completed');
    expect(result.skillName).toBe('create-social-post');
    expect(result.result.qa.passed).toBe(true);
    expect(result.result.contentItem.status).toBe('DRAFT');
    expect(result.result.contentItem.platform).toBe('facebook');
    expect(result.result.contentItem.body.length).toBeGreaterThan(0);
    // Never invents a phone number that isn't the client's.
    expect(result.result.contentItem.body).not.toMatch(/\(555\)\s?123/);

    const contentId = result.result.contentItem.id;

    await request(app).post(`/content/${contentId}/submit-for-review`).expect(200).expect((res) => {
      expect(res.body.contentItem.status).toBe('REVIEW');
    });

    await request(app)
      .post(`/content/${contentId}/approve`)
      .send({ reviewer: 'Marketing Manager' })
      .expect(200)
      .expect((res) => {
        expect(res.body.contentItem.status).toBe('APPROVED');
      });

    const publishRes = await request(app)
      .post(`/content/${contentId}/publish`)
      .send({ platform: 'facebook' })
      .expect(200);

    expect(publishRes.body.contentItem.status).toBe('PUBLISHED');
    expect(publishRes.body.contentItem.externalId).toMatch(/^mock-facebook-/);

    // Cleanup — client delete cascades to services/service-areas/brand
    // profile/content items at the DB level.
    await prisma.client.delete({ where: { id: client.id } });
  });

  it('reports an honest "not implemented" result for a not-yet-built agent instead of guessing', async () => {
    const slug = `cda-septic-systems-e2e-${randomUUID()}`;
    const createRes = await request(app).post('/clients').send({ slug, companyName: 'Test Co' }).expect(201);
    const client = createRes.body.client;

    const res = await request(app)
      .post('/orchestrator/requests')
      .send({ clientIdOrSlug: slug, instruction: 'Run a full SEO audit on our website.' })
      .expect(200);

    expect(res.body.result.status).toBe('not_implemented');

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('returns 404 for an unknown client instead of inventing one', async () => {
    await request(app)
      .post('/orchestrator/requests')
      .send({ clientIdOrSlug: 'does-not-exist-xyz', instruction: 'Create a Facebook post.' })
      .expect(404);
  });
});
