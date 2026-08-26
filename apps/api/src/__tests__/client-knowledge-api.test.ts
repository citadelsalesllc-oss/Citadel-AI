import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@citadel/database';
import { loadEnv } from '../env.js';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';

describe('client knowledge API', () => {
  const env = loadEnv();
  const container = buildContainer(env);
  const app = createApp(env, container);

  async function createClient(companyName = 'Knowledge API Test Co') {
    const slug = `knowledge-api-${randomUUID()}`;
    const res = await request(app).post('/clients').send({ slug, companyName }).expect(201);
    return { slug, client: res.body.client as { id: string } };
  }

  it('rejects creating a client without a company name', async () => {
    await request(app).post('/clients').send({ slug: `bad-${randomUUID()}` }).expect(400);
  });

  it('rejects a duplicate client slug with 409', async () => {
    const { slug, client } = await createClient();
    await request(app).post('/clients').send({ slug, companyName: 'Someone Else' }).expect(409);
    await prisma.client.delete({ where: { id: client.id } });
  });

  it('returns 404 (not 500) for an invalid client id on every knowledge endpoint', async () => {
    await request(app).get('/clients/does-not-exist').expect(404);
    await request(app).get('/clients/does-not-exist/context').expect(404);
    await request(app).post('/clients/does-not-exist/services').send({ serviceName: 'X' }).expect(404);
    await request(app).put('/clients/does-not-exist/brand-profile').send({}).expect(404);
  });

  it('adds a service, service area, SEO profile, FAQ, marketing note, and offer, then reflects them all in context', async () => {
    const { slug, client } = await createClient();

    await request(app).post(`/clients/${slug}/services`).send({ serviceName: 'Septic Pumping' }).expect(201);
    await request(app).post(`/clients/${slug}/service-areas`).send({ name: 'Post Falls, ID' }).expect(201);
    await request(app)
      .put(`/clients/${slug}/seo-profile`)
      .send({ primaryKeywords: ['septic pumping idaho'], competitors: ['Rival Septic Co'] })
      .expect(200);
    await request(app)
      .put(`/clients/${slug}/target-audience`)
      .send({ primaryCustomer: 'Homeowners on private septic systems' })
      .expect(200);
    await request(app)
      .post(`/clients/${slug}/faqs`)
      .send({ question: 'Do you offer emergency service?', answer: 'Yes.' })
      .expect(201);
    await request(app)
      .post(`/clients/${slug}/marketing-notes`)
      .send({ note: 'Customer prefers text over email.' })
      .expect(201);
    await request(app)
      .post(`/clients/${slug}/offers`)
      .send({ offerName: 'Free Inspection with Pumping' })
      .expect(201);

    const contextRes = await request(app).get(`/clients/${slug}/context`).expect(200);
    const context = contextRes.body.context;

    expect(context.services).toHaveLength(1);
    expect(context.serviceAreas).toHaveLength(1);
    expect(context.seoProfile.primaryKeywords).toEqual(['septic pumping idaho']);
    expect(context.targetAudience.primaryCustomer).toBe('Homeowners on private septic systems');
    expect(context.faqs).toHaveLength(1);
    expect(context.marketingNotes).toHaveLength(1);
    expect(context.offers).toHaveLength(1);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('updates a service via PATCH', async () => {
    const { slug, client } = await createClient();
    const addRes = await request(app).post(`/clients/${slug}/services`).send({ serviceName: 'Drain Field Repair' }).expect(201);
    const serviceId = addRes.body.service.id;

    const updateRes = await request(app)
      .patch(`/clients/${slug}/services/${serviceId}`)
      .send({ priority: 10, active: false })
      .expect(200);

    expect(updateRes.body.service.priority).toBe(10);
    expect(updateRes.body.service.active).toBe(false);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it('rejects malformed input with 400, not a 500', async () => {
    const { slug, client } = await createClient();
    // priority must be an integer
    await request(app).post(`/clients/${slug}/services`).send({ serviceName: 'X', priority: 'not-a-number' }).expect(400);
    // question/answer required for a FAQ
    await request(app).post(`/clients/${slug}/faqs`).send({ question: 'Only a question' }).expect(400);
    await prisma.client.delete({ where: { id: client.id } });
  });

  it('saves content directly via the content endpoint (storage only, no publishing in this phase)', async () => {
    const { slug, client } = await createClient();

    const res = await request(app)
      .post(`/clients/${slug}/content`)
      .send({ type: 'BLOG_POST', title: 'Why Septic Maintenance Matters', body: 'Body text.', tags: ['maintenance'] })
      .expect(201);

    expect(res.body.contentItem.status).toBe('DRAFT');
    expect(res.body.contentItem.title).toBe('Why Septic Maintenance Matters');
    expect(res.body.contentItem.tags).toEqual(['maintenance']);

    const listRes = await request(app).get(`/clients/${slug}/content`).expect(200);
    expect(listRes.body.contentItems).toHaveLength(1);

    await prisma.client.delete({ where: { id: client.id } });
  });

  it("one client's knowledge endpoints never return another client's data", async () => {
    const clientA = await createClient('Tenant A API Co');
    const clientB = await createClient('Tenant B API Co');

    await request(app).post(`/clients/${clientA.slug}/services`).send({ serviceName: "A's service" }).expect(201);

    const bServices = await request(app).get(`/clients/${clientB.slug}/services`).expect(200);
    expect(bServices.body.services).toEqual([]);

    const bContext = await request(app).get(`/clients/${clientB.slug}/context`).expect(200);
    expect(bContext.body.context.services).toEqual([]);

    await prisma.client.deleteMany({ where: { id: { in: [clientA.client.id, clientB.client.id] } } });
  });
});
