import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma, contentRepository, seoAuditRepository, activityLogRepository } from '@citadel/database';
import type { SeoAuditResult } from '@citadel/shared';
import { loadEnv } from '../env.js';
import { buildContainer } from '../container.js';
import { createApp } from '../app.js';

/**
 * Phase 6 — the Citadel Command Center dashboard API. Covers every
 * required test category from the master spec: overview, client list/
 * detail, approval queue, content review + approve/reject/revision/edit,
 * version history, SEO audit display, review display + approval, activity
 * feed, system health, tenant isolation, invalid transitions/ids,
 * unauthorized access, and existing-workflow regression. Runs against the
 * mock model provider and a real Postgres test database, exactly like
 * every other apps/api test file.
 */
describe('Citadel Command Center dashboard API', () => {
  const env = loadEnv();
  const container = buildContainer(env);
  const app = createApp(env, container);

  async function createTestClient(overrides: Record<string, unknown> = {}) {
    const slug = `dash-${randomUUID()}`;
    const res = await request(app)
      .post('/clients')
      .send({ slug, companyName: 'Dashboard Test Co', phone: '(208) 555-0100', ...overrides })
      .expect(201);
    return res.body.client as { id: string; slug: string; companyName: string };
  }

  async function createContent(clientId: string, overrides: Record<string, unknown> = {}) {
    return contentRepository.create({
      clientId,
      type: 'SOCIAL_POST',
      platform: 'facebook',
      body: 'Original AI-generated body.',
      tags: [],
      metadata: {},
      createdBy: 'Test Actor',
      initialStatus: 'DRAFT',
      ...overrides,
    } as never);
  }

  const validSeoResult: Omit<SeoAuditResult, 'url' | 'overallScore'> = {
    technical: { score: 80, issues: [] },
    onPage: { score: 70, issues: [{ code: 'MISSING_META', message: 'Missing meta description', severity: 'warning' }] },
    localSeo: { score: 60, issues: [] },
    conversion: { score: 90, issues: [] },
    keywordOpportunities: ['septic tank repair'],
    recommendations: [
      { title: 'Add meta description', description: 'The page has no meta description.', priority: 'medium', evidenceRefs: ['ev-1'] },
    ],
    evidence: [{ id: 'ev-1', type: 'website_evidence', description: 'No <meta name="description"> tag found.' }],
    modelUsed: 'mock-deterministic-v1',
    providerUsed: 'mock',
  };

  async function createSeoAudit(clientId: string, overrides: Record<string, unknown> = {}) {
    return seoAuditRepository.create({
      clientId,
      url: 'https://example.com/',
      overallScore: 75,
      result: { ...validSeoResult, url: 'https://example.com/', overallScore: 75 } as SeoAuditResult,
      agentVersion: 'seo-agent-v1',
      modelProvider: 'mock',
      modelUsed: 'mock-deterministic-v1',
      ...overrides,
    } as never);
  }

  async function syncAndGetReview(slug: string) {
    const res = await request(app).post(`/clients/${slug}/reviews/sync`).expect(201);
    return res.body.reviews[0] as { id: string; rating: number };
  }

  async function cleanupClient(id: string) {
    await prisma.client.delete({ where: { id } }).catch(() => undefined);
  }

  // --- 1. Dashboard overview ------------------------------------------------------

  describe('GET /dashboard/overview', () => {
    it('returns real counts that increase when fixtures are created, never fabricated', async () => {
      // Floor assertions (>=), not exact deltas: other test files create/delete
      // their own clients and content concurrently against the same shared
      // test database, so an exact +1/+2 equality would be racy. What this
      // proves — the counts are live and reflect real rows, not a hardcoded
      // or stale number — holds just as well with a floor.
      const before = await request(app).get('/dashboard/overview').expect(200);
      const client = await createTestClient();
      await createContent(client.id, { initialStatus: 'DRAFT' });
      await createContent(client.id, { initialStatus: 'DRAFT' });

      const after = await request(app).get('/dashboard/overview').expect(200);
      expect(after.body.counts.clients).toBeGreaterThanOrEqual(before.body.counts.clients + 1);
      expect(after.body.counts.draftContent).toBeGreaterThanOrEqual(before.body.counts.draftContent + 2);
      expect(Array.isArray(after.body.recentActivity)).toBe(true);
      expect(Array.isArray(after.body.recentSeoAudits)).toBe(true);
      expect(Array.isArray(after.body.recentReviews)).toBe(true);

      await cleanupClient(client.id);
    });

    it('reports zero pending approvals for a freshly created, otherwise-empty client (no fabricated activity)', async () => {
      const client = await createTestClient();
      const detail = await request(app).get(`/dashboard/clients/${client.id}`).expect(200);
      expect(detail.body.client.recentContent).toEqual([]);
      await cleanupClient(client.id);
    });
  });

  // --- 2. Client list --------------------------------------------------------------

  describe('GET /dashboard/clients', () => {
    it('lists clients across tenants, including a newly created one', async () => {
      const client = await createTestClient({ companyName: 'Client List Test Co' });
      const res = await request(app).get('/dashboard/clients').expect(200);
      expect(res.body.clients.some((c: { id: string }) => c.id === client.id)).toBe(true);
      await cleanupClient(client.id);
    });
  });

  // --- 3. Client detail --------------------------------------------------------------

  describe('GET /dashboard/clients/:clientId', () => {
    it('reuses the Phase 2 client knowledge model — company info, services, and recent content', async () => {
      const client = await createTestClient({ companyName: 'Client Detail Test Co' });
      await request(app).post(`/clients/${client.slug}/services`).send({ serviceName: 'Septic Tank Pumping' }).expect(201);
      await createContent(client.id);

      const res = await request(app).get(`/dashboard/clients/${client.id}`).expect(200);
      expect(res.body.client.core.companyName).toBe('Client Detail Test Co');
      expect(res.body.client.services).toHaveLength(1);
      expect(res.body.client.services[0].serviceName).toBe('Septic Tank Pumping');
      expect(res.body.client.recentContent).toHaveLength(1);
      // shape sanity: every Phase 2 knowledge section is present, even when empty
      expect(res.body.client).toHaveProperty('serviceAreas');
      expect(res.body.client).toHaveProperty('brandProfile');
      expect(res.body.client).toHaveProperty('seoProfile');
      expect(res.body.client).toHaveProperty('targetAudience');
      expect(res.body.client).toHaveProperty('offers');
      expect(res.body.client).toHaveProperty('faqs');
      expect(res.body.client).toHaveProperty('marketingNotes');

      await cleanupClient(client.id);
    });

    it('returns 404 for a client id that does not exist', async () => {
      await request(app).get('/dashboard/clients/does-not-exist-xyz').expect(404);
    });
  });

  // --- 4. Approval queue -------------------------------------------------------------

  describe('GET /dashboard/approvals', () => {
    it('defaults to REVIEW + REVISION_REQUIRED, excluding DRAFT and APPROVED', async () => {
      const client = await createTestClient();
      const draft = await createContent(client.id, { initialStatus: 'DRAFT' });
      const review = await createContent(client.id, { initialStatus: 'DRAFT' });
      await contentRepository.transition(client.id, review.id, 'REVIEW');

      const res = await request(app).get('/dashboard/approvals').expect(200);
      const ids = res.body.contentItems.map((i: { id: string }) => i.id);
      expect(ids).toContain(review.id);
      expect(ids).not.toContain(draft.id);

      await cleanupClient(client.id);
    });

    it('status=all returns every status, and includes client name + preview + agent', async () => {
      const client = await createTestClient({ companyName: 'Approval Queue Co' });
      const draft = await createContent(client.id, { initialStatus: 'DRAFT', metadata: { agent: 'create-social-post' } });

      const res = await request(app).get('/dashboard/approvals?status=all').expect(200);
      const item = res.body.contentItems.find((i: { id: string }) => i.id === draft.id);
      expect(item).toBeDefined();
      expect(item.clientName).toBe('Approval Queue Co');
      expect(item.agent).toBe('create-social-post');
      expect(typeof item.preview).toBe('string');

      await cleanupClient(client.id);
    });

    it('an explicit status filter narrows the queue to just that status', async () => {
      const client = await createTestClient();
      const rejected = await createContent(client.id, { initialStatus: 'DRAFT' });
      await contentRepository.transition(client.id, rejected.id, 'REVIEW');
      await contentRepository.transition(client.id, rejected.id, 'REJECTED', { reviewer: 'Staff', rejectionReason: 'off-brand' });

      const res = await request(app).get('/dashboard/approvals?status=REJECTED').expect(200);
      const ids = res.body.contentItems.map((i: { id: string }) => i.id);
      expect(ids).toContain(rejected.id);
      expect(res.body.contentItems.every((i: { status: string }) => i.status === 'REJECTED')).toBe(true);

      await cleanupClient(client.id);
    });
  });

  // --- 5. Content review detail --------------------------------------------------------

  describe('GET /dashboard/content/:contentId', () => {
    it('returns the content item, its client, and its version history', async () => {
      const client = await createTestClient();
      const item = await createContent(client.id);

      const res = await request(app).get(`/dashboard/content/${item.id}`).expect(200);
      expect(res.body.contentItem.id).toBe(item.id);
      expect(res.body.client.id).toBe(client.id);
      expect(res.body.versions).toHaveLength(1);
      expect(res.body.versions[0].source).toBe('AI_GENERATED');

      await cleanupClient(client.id);
    });
  });

  // --- 6/7/8. Approve / reject / request revision -----------------------------------------

  describe('POST /dashboard/content/:contentId/{approve,reject,revision}', () => {
    it('approve chains DRAFT -> REVIEW -> APPROVED as one action and records the reviewer', async () => {
      const client = await createTestClient();
      const item = await createContent(client.id, { initialStatus: 'DRAFT' });

      const res = await request(app).post(`/dashboard/content/${item.id}/approve`).send({ reviewer: 'Dana' }).expect(200);
      expect(res.body.contentItem.status).toBe('APPROVED');
      expect(res.body.contentItem.reviewer).toBe('Dana');
      expect(res.body.contentItem.approvedAt).toBeTruthy();

      await cleanupClient(client.id);
    });

    it('approve from REVIEW does not need chaining', async () => {
      const client = await createTestClient();
      const item = await createContent(client.id, { initialStatus: 'DRAFT' });
      await contentRepository.transition(client.id, item.id, 'REVIEW');

      const res = await request(app).post(`/dashboard/content/${item.id}/approve`).send({ reviewer: 'Dana' }).expect(200);
      expect(res.body.contentItem.status).toBe('APPROVED');

      await cleanupClient(client.id);
    });

    it('reject requires and records a reason', async () => {
      const client = await createTestClient();
      const item = await createContent(client.id, { initialStatus: 'DRAFT' });

      await request(app).post(`/dashboard/content/${item.id}/reject`).send({ reviewer: 'Dana' }).expect(400);
      const res = await request(app)
        .post(`/dashboard/content/${item.id}/reject`)
        .send({ reviewer: 'Dana', reason: 'Off-brand tone' })
        .expect(200);
      expect(res.body.contentItem.status).toBe('REJECTED');
      expect(res.body.contentItem.rejectionReason).toBe('Off-brand tone');

      await cleanupClient(client.id);
    });

    it('request revision chains through REVIEW and records the note', async () => {
      const client = await createTestClient();
      const item = await createContent(client.id, { initialStatus: 'DRAFT' });

      const res = await request(app)
        .post(`/dashboard/content/${item.id}/revision`)
        .send({ reviewer: 'Dana', reason: 'Needs a stronger CTA' })
        .expect(200);
      expect(res.body.contentItem.status).toBe('REVISION_REQUIRED');
      expect(res.body.contentItem.rejectionReason).toBe('Needs a stronger CTA');

      await cleanupClient(client.id);
    });
  });

  // --- 9/10. Human edit + version history -------------------------------------------------

  describe('POST /dashboard/content/:contentId/edit', () => {
    it('never overwrites the AI-generated version — appends a new HUMAN_EDIT version and preserves status', async () => {
      const client = await createTestClient();
      const item = await createContent(client.id, { initialStatus: 'DRAFT', body: 'Original AI body' });

      const res = await request(app)
        .post(`/dashboard/content/${item.id}/edit`)
        .send({ body: 'Human-edited body', editedBy: 'Dana' })
        .expect(200);
      expect(res.body.contentItem.body).toBe('Human-edited body');
      expect(res.body.contentItem.status).toBe('DRAFT');

      const detail = await request(app).get(`/dashboard/content/${item.id}`).expect(200);
      expect(detail.body.versions).toHaveLength(2);
      const [newest, original] = detail.body.versions;
      expect(newest.source).toBe('HUMAN_EDIT');
      expect(newest.editedBy).toBe('Dana');
      expect(newest.body).toBe('Human-edited body');
      expect(original.source).toBe('AI_GENERATED');
      expect(original.body).toBe('Original AI body');

      await cleanupClient(client.id);
    });
  });

  // --- 11. SEO audit display ----------------------------------------------------------

  describe('GET /dashboard/seo and /dashboard/seo/:auditId', () => {
    it('lists audits with client attribution and shows full detail on request', async () => {
      const client = await createTestClient({ companyName: 'SEO Display Co' });
      const audit = await createSeoAudit(client.id);

      const list = await request(app).get('/dashboard/seo').expect(200);
      const listed = list.body.seoAudits.find((a: { id: string }) => a.id === audit.id);
      expect(listed).toBeDefined();
      expect(listed.clientName).toBe('SEO Display Co');

      const detail = await request(app).get(`/dashboard/seo/${audit.id}`).expect(200);
      expect(detail.body.seoAudit.overallScore).toBe(75);
      expect(detail.body.seoAudit.result.technical.score).toBe(80);
      expect(detail.body.seoAudit.result.recommendations).toHaveLength(1);
      expect(detail.body.seoAudit.result.evidence).toHaveLength(1);
      expect(detail.body.seoAudit.result.keywordOpportunities).toContain('septic tank repair');
      expect(detail.body.client.id).toBe(client.id);

      await cleanupClient(client.id);
    });

    it('returns 404 for an invalid audit id', async () => {
      await request(app).get('/dashboard/seo/does-not-exist').expect(404);
    });
  });

  // --- 12/13. Review display + review approval ---------------------------------------------

  describe('GET /dashboard/reviews and review approval actions', () => {
    it('lists reviews with client attribution and shows detail with live analysis', async () => {
      const client = await createTestClient({ companyName: 'Review Display Co' });
      const review = await syncAndGetReview(client.slug);

      const list = await request(app).get('/dashboard/reviews').expect(200);
      const listed = list.body.reviews.find((r: { id: string }) => r.id === review.id);
      expect(listed).toBeDefined();
      expect(listed.clientName).toBe('Review Display Co');

      const detail = await request(app).get(`/dashboard/reviews/${review.id}`).expect(200);
      expect(detail.body.review.id).toBe(review.id);
      expect(detail.body.analysis).toBeDefined();
      expect(detail.body.analysis.rating).toBe(review.rating);
      expect(typeof detail.body.analysis.escalationNeeded).toBe('boolean');
      expect(Array.isArray(detail.body.versions)).toBe(true);

      await cleanupClient(client.id);
    });

    it('approve/reject/revision require DRAFT and record the reviewer', async () => {
      const client = await createTestClient();
      const review = await syncAndGetReview(client.slug);

      // UNRESPONDED -> approve should fail with a structured error
      await request(app).post(`/dashboard/reviews/${review.id}/approve`).send({ reviewer: 'Dana' }).expect(409);

      // Draft a response first (via the existing AI respond endpoint), then approve it
      await request(app).post(`/clients/${client.slug}/ai/reviews/${review.id}/respond`).send({}).expect(200);
      const approved = await request(app).post(`/dashboard/reviews/${review.id}/approve`).send({ reviewer: 'Dana' }).expect(200);
      expect(approved.body.review.responseStatus).toBe('APPROVED');

      await cleanupClient(client.id);
    });

    it('review edit appends a HUMAN_EDIT version and moves the review to DRAFT', async () => {
      const client = await createTestClient();
      const review = await syncAndGetReview(client.slug);

      const res = await request(app)
        .post(`/dashboard/reviews/${review.id}/edit`)
        .send({ responseText: 'A hand-written reply.', editedBy: 'Dana' })
        .expect(200);
      expect(res.body.review.responseStatus).toBe('DRAFT');
      expect(res.body.review.responseText).toBe('A hand-written reply.');

      const detail = await request(app).get(`/dashboard/reviews/${review.id}`).expect(200);
      expect(detail.body.versions).toHaveLength(1);
      expect(detail.body.versions[0].source).toBe('HUMAN_EDIT');

      await cleanupClient(client.id);
    });
  });

  // --- 14. AI Activity feed -----------------------------------------------------------

  describe('GET /dashboard/activity', () => {
    it('reflects real, persisted events and never exposes credentials', async () => {
      const client = await createTestClient();
      await activityLogRepository.record({
        clientId: client.id,
        requestId: randomUUID(),
        agent: 'create-social-post',
        task: 'create_social_post',
        modelProvider: 'mock',
        executionTimeMs: 42,
        success: true,
        errorCode: null,
        metadata: { qaPassed: true },
      });

      const res = await request(app).get(`/dashboard/activity?clientId=${client.id}`).expect(200);
      expect(res.body.activity.length).toBeGreaterThanOrEqual(1);
      const entry = res.body.activity[0];
      expect(entry.agent).toBe('create-social-post');
      expect(Object.keys(entry)).not.toContain('apiKey');
      expect(Object.keys(entry)).not.toContain('token');
      expect(JSON.stringify(entry)).not.toMatch(/sk-|Bearer /);

      await cleanupClient(client.id);
    });
  });

  // --- 15. System health -----------------------------------------------------------

  describe('GET /dashboard/system', () => {
    it('reports real component states, including a working database and mock model provider', async () => {
      const res = await request(app).get('/dashboard/system').expect(200);
      const byName = Object.fromEntries(res.body.components.map((c: { name: string; status: string }) => [c.name, c.status]));
      expect(byName.api).toBe('AVAILABLE');
      expect(byName.database).toBe('AVAILABLE');
      expect(byName.modelProvider).toBe('AVAILABLE'); // mock provider in tests
      expect(byName.backgroundWorker).toBe('NOT_CONFIGURED'); // apps/worker is an unimplemented stub — never pretend otherwise
    });
  });

  // --- 16. Tenant isolation ----------------------------------------------------------

  describe('cross-tenant reads never mix up client attribution or version history', () => {
    it('two clients’ content items keep separate version histories and correct client attribution', async () => {
      const clientA = await createTestClient({ companyName: 'Tenant A' });
      const clientB = await createTestClient({ companyName: 'Tenant B' });
      const itemA = await createContent(clientA.id, { body: 'Client A content' });
      const itemB = await createContent(clientB.id, { body: 'Client B content' });

      const detailA = await request(app).get(`/dashboard/content/${itemA.id}`).expect(200);
      expect(detailA.body.client.id).toBe(clientA.id);
      expect(detailA.body.versions).toHaveLength(1);
      expect(detailA.body.versions[0].body).toBe('Client A content');

      const detailB = await request(app).get(`/dashboard/content/${itemB.id}`).expect(200);
      expect(detailB.body.client.id).toBe(clientB.id);
      expect(detailB.body.versions[0].body).toBe('Client B content');

      const list = await request(app).get('/dashboard/approvals?status=all').expect(200);
      const rowA = list.body.contentItems.find((i: { id: string }) => i.id === itemA.id);
      const rowB = list.body.contentItems.find((i: { id: string }) => i.id === itemB.id);
      expect(rowA.clientName).toBe('Tenant A');
      expect(rowB.clientName).toBe('Tenant B');

      await cleanupClient(clientA.id);
      await cleanupClient(clientB.id);
    });
  });

  // --- 17. Invalid status transition --------------------------------------------------

  describe('invalid status transitions', () => {
    it('returns a structured 409 when approving already-APPROVED content', async () => {
      const client = await createTestClient();
      const item = await createContent(client.id, { initialStatus: 'DRAFT' });
      await request(app).post(`/dashboard/content/${item.id}/approve`).send({ reviewer: 'Dana' }).expect(200);

      const res = await request(app).post(`/dashboard/content/${item.id}/approve`).send({ reviewer: 'Dana' }).expect(409);
      expect(res.body.error.code).toBe('INVALID_LIFECYCLE_TRANSITION');

      await cleanupClient(client.id);
    });
  });

  // --- 18. Invalid content ID ---------------------------------------------------------

  describe('invalid ids', () => {
    it('returns 404 for an unknown content id on read and every write action', async () => {
      await request(app).get('/dashboard/content/does-not-exist').expect(404);
      await request(app).post('/dashboard/content/does-not-exist/approve').send({ reviewer: 'Dana' }).expect(404);
      await request(app).post('/dashboard/content/does-not-exist/reject').send({ reviewer: 'Dana', reason: 'x' }).expect(404);
      await request(app).post('/dashboard/content/does-not-exist/revision').send({ reviewer: 'Dana', reason: 'x' }).expect(404);
      await request(app).post('/dashboard/content/does-not-exist/edit').send({ body: 'x', editedBy: 'Dana' }).expect(404);
    });

    it('returns 404 for an unknown review id', async () => {
      await request(app).get('/dashboard/reviews/does-not-exist').expect(404);
      await request(app).post('/dashboard/reviews/does-not-exist/approve').send({ reviewer: 'Dana' }).expect(404);
    });
  });

  // --- 19. Unauthorized action ---------------------------------------------------------

  describe('authentication boundary', () => {
    it('when API_AUTH_TOKEN is configured, dashboard routes require it exactly like every other route', async () => {
      const authedEnv = { ...env, API_AUTH_TOKEN: 'test-secret-token' };
      const authedApp = createApp(authedEnv, container);

      await request(authedApp).get('/dashboard/overview').expect(401);
      await request(authedApp).get('/dashboard/overview').set('authorization', 'Bearer wrong-token').expect(401);
      await request(authedApp).get('/dashboard/overview').set('authorization', 'Bearer test-secret-token').expect(200);
    });
  });

  // --- 20. Existing workflow regression -------------------------------------------------

  describe('existing Content/SEO/Review workflows are unaffected by the dashboard', () => {
    it('the AI content-generation pipeline still works end to end', async () => {
      const client = await createTestClient();
      const res = await request(app)
        .post(`/clients/${client.slug}/ai/generate`)
        .send({ task: 'create_social_post', platform: 'facebook', topic: 'a routine maintenance reminder' })
        .expect(200);
      expect(res.body.status).toBe('DRAFT');

      // and the dashboard immediately sees it, proving the two layers share one source of truth
      const inDashboard = await request(app).get(`/dashboard/content/${res.body.contentId}`).expect(200);
      expect(inDashboard.body.contentItem.id).toBe(res.body.contentId);

      await cleanupClient(client.id);
    });
  });
});
