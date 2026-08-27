import { Router } from 'express';
import { z } from 'zod';
import {
  prisma,
  clientRepository,
  contentRepository,
  seoAuditRepository,
  reviewRepository,
  activityLogRepository,
  getClientContext,
} from '@citadel/database';
import {
  ContentStatusSchema,
  ReviewResponseStatusSchema,
  type ClientRecord,
  type ContentStatus,
  type ToolRegistry,
} from '@citadel/shared';
import { ReviewAnalysisAgent } from '@citadel/agents';
import type { Env } from '../env.js';
import { asyncHandler } from './async-handler.js';

const reviewAnalysisAgent = new ReviewAnalysisAgent();

const OVERVIEW_RECENT_LIMIT = 10;
const ACTIVITY_DEFAULT_LIMIT = 50;
const DEFAULT_APPROVAL_STATUSES: ContentStatus[] = ['REVIEW', 'REVISION_REQUIRED'];

/**
 * The Citadel Command Center's JSON API (Phase 6) — an internal staff tool,
 * not a public/client-facing surface. Lives in apps/api rather than a
 * separate backend so there is exactly one authoritative business-logic
 * layer: every read here reuses the same repositories every other route
 * uses, and every write reuses the same tenant-scoped tools
 * (approval_request/content_approve/... , review_approve/...) that already
 * enforce ownership, valid transitions, and audit logging. Auth is
 * whatever's mounted ahead of this router in app.ts (see
 * middleware/auth.ts) — there is no dashboard-specific auth layer, per the
 * master spec's "reuse existing auth if present" allowance. See
 * SECURITY.md "Command Center authentication boundary" for what a real
 * deployment still needs (staff accounts, roles, session auth).
 *
 * "DASHBOARD-ONLY" cross-tenant reads (requireByIdGlobal /
 * listAllForDashboard) are used throughout, by design — see each
 * repository's doc comment. Every WRITE below still resolves the true
 * clientId from the fetched record before calling a tenant-scoped tool or
 * repository method; nothing here accepts a caller-supplied clientId for a
 * write.
 */
export function dashboardRouter(toolRegistry: ToolRegistry, env: Env): Router {
  const router = Router();

  function withClientNames<T extends { clientId: string }>(items: T[], clients: ClientRecord[]): (T & { clientName: string | null })[] {
    const byId = new Map(clients.map((c) => [c.id, c.companyName]));
    return items.map((item) => ({ ...item, clientName: byId.get(item.clientId) ?? null }));
  }

  // --- Overview -------------------------------------------------------------

  router.get(
    '/overview',
    asyncHandler(async (_req, res) => {
      const [clients, draftContent, pendingApprovals, revisionRequiredContent, recentActivity, recentSeoAudits, recentReviews] =
        await Promise.all([
          clientRepository.list(),
          contentRepository.listAllForDashboard({ statuses: ['DRAFT'] }),
          contentRepository.listAllForDashboard({ statuses: ['REVIEW'] }),
          contentRepository.listAllForDashboard({ statuses: ['REVISION_REQUIRED'] }),
          activityLogRepository.listAllForDashboard(OVERVIEW_RECENT_LIMIT),
          seoAuditRepository.listAllForDashboard({ limit: OVERVIEW_RECENT_LIMIT }),
          reviewRepository.listAllForDashboard({ limit: OVERVIEW_RECENT_LIMIT }),
        ]);

      res.json({
        counts: {
          clients: clients.length,
          pendingApprovals: pendingApprovals.length,
          draftContent: draftContent.length,
          revisionRequiredContent: revisionRequiredContent.length,
        },
        recentActivity,
        recentSeoAudits: withClientNames(recentSeoAudits, clients),
        recentReviews: withClientNames(recentReviews, clients),
      });
    }),
  );

  // --- Clients ---------------------------------------------------------------
  // Read-only views over the Phase 2 client knowledge model — no new client
  // data model here, per the master spec's "do not duplicate the client
  // database."

  router.get(
    '/clients',
    asyncHandler(async (_req, res) => {
      const clients = await clientRepository.list();
      res.json({ clients });
    }),
  );

  router.get(
    '/clients/:clientId',
    asyncHandler(async (req, res) => {
      const context = await getClientContext(req.params.clientId as string);
      res.json({ client: context });
    }),
  );

  // --- Approval Center + Content browsing ---------------------------------------
  // One endpoint serves both the "Approvals" dashboard section (default:
  // REVIEW + REVISION_REQUIRED, the queue that actually needs a human
  // decision) and the "Content" section (status=all, every content item
  // regardless of lifecycle stage) — the master spec's explicit endpoint
  // list names only GET /dashboard/approvals, so Content browsing reuses it
  // with a different default query rather than inventing a second route.

  const ApprovalsQuerySchema = z.object({ status: z.string().optional() });

  router.get(
    '/approvals',
    asyncHandler(async (req, res) => {
      const query = ApprovalsQuerySchema.parse(req.query);
      let statuses: ContentStatus[] | undefined;
      if (!query.status) {
        statuses = DEFAULT_APPROVAL_STATUSES;
      } else if (query.status === 'all') {
        statuses = undefined;
      } else {
        statuses = z.array(ContentStatusSchema).parse(query.status.split(',').map((s) => s.trim()));
      }
      const [items, clients] = await Promise.all([
        contentRepository.listAllForDashboard({ statuses }),
        clientRepository.list(),
      ]);
      const enriched = withClientNames(items, clients).map((item) => ({
        ...item,
        agent: (item.metadata as Record<string, unknown>)['agent'] ?? item.createdBy,
        preview: item.body.length > 200 ? `${item.body.slice(0, 200)}…` : item.body,
      }));
      res.json({ contentItems: enriched });
    }),
  );

  // --- Content review detail + actions ------------------------------------------

  router.get(
    '/content/:contentId',
    asyncHandler(async (req, res) => {
      const item = await contentRepository.requireByIdGlobal(req.params.contentId as string);
      const [client, versions] = await Promise.all([
        clientRepository.requireByIdOrSlug(item.clientId),
        contentRepository.listVersions(item.clientId, item.id),
      ]);
      res.json({ contentItem: item, client, versions });
    }),
  );

  const ApproverBodySchema = z.object({ reviewer: z.string().min(1) });
  const ReasonBodySchema = z.object({ reviewer: z.string().min(1), reason: z.string().min(1) });
  const EditBodySchema = z.object({ body: z.string().min(1), editedBy: z.string().min(1) });

  /**
   * Chains approval_request (DRAFT/REVISION_REQUIRED -> REVIEW) ahead of the
   * target transition when the item isn't in REVIEW yet, so a single
   * dashboard button click still produces two real, audit-logged
   * transitions rather than skipping a step of the state machine. Already
   * in REVIEW -> only the target transition runs. Anything else (APPROVED,
   * PUBLISHED, REJECTED, FAILED) is left to fail naturally with a
   * structured InvalidLifecycleTransitionError.
   */
  async function ensureInReview(clientId: string, contentId: string, actor: { id: string; label: string }, requestId: string): Promise<void> {
    const current = await contentRepository.requireByIdForClient(clientId, contentId);
    if (current.status !== 'REVIEW') {
      await toolRegistry.call('approval_request', { clientIdOrSlug: clientId, contentId }, { actor, requestId, clientId });
    }
  }

  router.post(
    '/content/:contentId/approve',
    asyncHandler(async (req, res) => {
      const body = ApproverBodySchema.parse(req.body);
      const contentId = req.params.contentId as string;
      const item = await contentRepository.requireByIdGlobal(contentId);
      await ensureInReview(item.clientId, contentId, req.actor, req.requestId);
      const approved = await toolRegistry.call(
        'content_approve',
        { clientIdOrSlug: item.clientId, contentId, reviewer: body.reviewer },
        { actor: req.actor, requestId: req.requestId, clientId: item.clientId },
      );
      res.json({ contentItem: approved });
    }),
  );

  router.post(
    '/content/:contentId/reject',
    asyncHandler(async (req, res) => {
      const body = ReasonBodySchema.parse(req.body);
      const contentId = req.params.contentId as string;
      const item = await contentRepository.requireByIdGlobal(contentId);
      await ensureInReview(item.clientId, contentId, req.actor, req.requestId);
      const rejected = await toolRegistry.call(
        'content_reject',
        { clientIdOrSlug: item.clientId, contentId, reviewer: body.reviewer, reason: body.reason },
        { actor: req.actor, requestId: req.requestId, clientId: item.clientId },
      );
      res.json({ contentItem: rejected });
    }),
  );

  router.post(
    '/content/:contentId/revision',
    asyncHandler(async (req, res) => {
      const body = ReasonBodySchema.parse(req.body);
      const contentId = req.params.contentId as string;
      const item = await contentRepository.requireByIdGlobal(contentId);
      await ensureInReview(item.clientId, contentId, req.actor, req.requestId);
      const revised = await toolRegistry.call(
        'content_request_revision',
        { clientIdOrSlug: item.clientId, contentId, reviewer: body.reviewer, reason: body.reason },
        { actor: req.actor, requestId: req.requestId, clientId: item.clientId },
      );
      res.json({ contentItem: revised });
    }),
  );

  /**
   * Never overwrites the AI-generated body — contentRepository.editContent
   * appends a new ContentVersion (source HUMAN_EDIT) and updates the
   * item's current body, without touching status. See ContentVersion's doc
   * comment in database/prisma/schema.prisma.
   */
  router.post(
    '/content/:contentId/edit',
    asyncHandler(async (req, res) => {
      const body = EditBodySchema.parse(req.body);
      const contentId = req.params.contentId as string;
      const item = await contentRepository.requireByIdGlobal(contentId);
      const updated = await contentRepository.editContent(item.clientId, contentId, body);
      res.json({ contentItem: updated });
    }),
  );

  // --- SEO audits (read-only — never let a dashboard edit alter an audit result) --

  router.get(
    '/seo',
    asyncHandler(async (_req, res) => {
      const [audits, clients] = await Promise.all([seoAuditRepository.listAllForDashboard({}), clientRepository.list()]);
      res.json({ seoAudits: withClientNames(audits, clients) });
    }),
  );

  router.get(
    '/seo/:auditId',
    asyncHandler(async (req, res) => {
      const audit = await seoAuditRepository.requireByIdGlobal(req.params.auditId as string);
      const client = await clientRepository.requireByIdOrSlug(audit.clientId);
      res.json({ seoAudit: audit, client });
    }),
  );

  // --- Reviews + review-response approval -----------------------------------------

  const ReviewsQuerySchema = z.object({
    status: z
      .string()
      .optional()
      .transform((value) => (value ? value.split(',').map((s) => s.trim()) : undefined))
      .pipe(z.array(ReviewResponseStatusSchema).optional()),
  });

  router.get(
    '/reviews',
    asyncHandler(async (req, res) => {
      const query = ReviewsQuerySchema.parse(req.query);
      const [reviews, clients] = await Promise.all([
        reviewRepository.listAllForDashboard({ statuses: query.status }),
        clientRepository.list(),
      ]);
      res.json({ reviews: withClientNames(reviews, clients) });
    }),
  );

  /**
   * Runs the same deterministic analysis engine review_analyze uses (no
   * model call, no side effects — see ReviewAnalysisAgent) so the detail
   * view's escalation warning is real, not a guess: Review rows don't
   * persist an escalationNeeded column, so this is the only honest way to
   * show it without inventing one.
   */
  router.get(
    '/reviews/:reviewId',
    asyncHandler(async (req, res) => {
      const review = await reviewRepository.requireByIdGlobal(req.params.reviewId as string);
      const [client, versions] = await Promise.all([
        getClientContext(review.clientId),
        reviewRepository.listResponseVersions(review.clientId, review.id),
      ]);
      const analysis = await reviewAnalysisAgent.run({ review }, { client, actor: req.actor, requestId: req.requestId });
      res.json({ review, client: client.core, versions, analysis });
    }),
  );

  router.post(
    '/reviews/:reviewId/approve',
    asyncHandler(async (req, res) => {
      const body = ApproverBodySchema.parse(req.body);
      const reviewId = req.params.reviewId as string;
      const review = await reviewRepository.requireByIdGlobal(reviewId);
      const approved = await toolRegistry.call(
        'review_approve',
        { clientId: review.clientId, reviewId, reviewer: body.reviewer },
        { actor: req.actor, requestId: req.requestId, clientId: review.clientId },
      );
      res.json({ review: approved });
    }),
  );

  router.post(
    '/reviews/:reviewId/reject',
    asyncHandler(async (req, res) => {
      const body = ReasonBodySchema.parse(req.body);
      const reviewId = req.params.reviewId as string;
      const review = await reviewRepository.requireByIdGlobal(reviewId);
      const rejected = await toolRegistry.call(
        'review_reject',
        { clientId: review.clientId, reviewId, reviewer: body.reviewer, reason: body.reason },
        { actor: req.actor, requestId: req.requestId, clientId: review.clientId },
      );
      res.json({ review: rejected });
    }),
  );

  router.post(
    '/reviews/:reviewId/revision',
    asyncHandler(async (req, res) => {
      const body = ReasonBodySchema.parse(req.body);
      const reviewId = req.params.reviewId as string;
      const review = await reviewRepository.requireByIdGlobal(reviewId);
      const revised = await toolRegistry.call(
        'review_request_revision',
        { clientId: review.clientId, reviewId, reviewer: body.reviewer, reason: body.reason },
        { actor: req.actor, requestId: req.requestId, clientId: review.clientId },
      );
      res.json({ review: revised });
    }),
  );

  const ReviewEditBodySchema = z.object({ responseText: z.string().min(1), editedBy: z.string().min(1) });

  router.post(
    '/reviews/:reviewId/edit',
    asyncHandler(async (req, res) => {
      const body = ReviewEditBodySchema.parse(req.body);
      const reviewId = req.params.reviewId as string;
      const review = await reviewRepository.requireByIdGlobal(reviewId);
      const updated = await reviewRepository.editResponse(review.clientId, reviewId, body);
      res.json({ review: updated });
    }),
  );

  // --- AI Activity feed --------------------------------------------------------
  // Reads ActivityLog, the persisted counterpart to logger.ts's console
  // lines — never generated content or review text, only ids and outcome
  // metadata (see ActivityLogEntrySchema's doc comment).

  const ActivityQuerySchema = z.object({
    clientId: z.string().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  });

  router.get(
    '/activity',
    asyncHandler(async (req, res) => {
      const query = ActivityQuerySchema.parse(req.query);
      const limit = query.limit ?? ACTIVITY_DEFAULT_LIMIT;
      const entries = query.clientId
        ? await activityLogRepository.listByClient(query.clientId, limit)
        : await activityLogRepository.listAllForDashboard(limit);
      res.json({ activity: entries });
    }),
  );

  // --- System status -----------------------------------------------------------
  // Every state below reflects something actually checked or actually
  // configured — never "assume available." See SECURITY.md and
  // ARCHITECTURE.md's OpenClaw section for why backgroundWorker is
  // NOT_CONFIGURED today (apps/worker is a reserved, unimplemented stub).

  router.get(
    '/system',
    asyncHandler(async (_req, res) => {
      const components: { name: string; status: 'CONFIGURED' | 'AVAILABLE' | 'NOT_CONFIGURED' | 'ERROR'; detail: string }[] = [];

      components.push({ name: 'api', status: 'AVAILABLE', detail: 'Serving requests.' });

      try {
        await prisma.$queryRaw`SELECT 1`;
        components.push({ name: 'database', status: 'AVAILABLE', detail: 'Connected to PostgreSQL.' });
      } catch (error) {
        components.push({ name: 'database', status: 'ERROR', detail: `Query failed: ${String(error)}` });
      }

      if (env.MODEL_PROVIDER === 'mock') {
        components.push({ name: 'modelProvider', status: 'AVAILABLE', detail: 'Mock provider — no external dependency.' });
      } else if (env.ANTHROPIC_API_KEY) {
        components.push({ name: 'modelProvider', status: 'CONFIGURED', detail: `Anthropic (${env.ANTHROPIC_MODEL}) — credentials present.` });
      } else {
        components.push({ name: 'modelProvider', status: 'NOT_CONFIGURED', detail: 'MODEL_PROVIDER=anthropic but ANTHROPIC_API_KEY is unset.' });
      }

      components.push({
        name: 'backgroundWorker',
        status: 'NOT_CONFIGURED',
        detail: 'apps/worker is a reserved stub — no background worker runs yet.',
      });

      if (env.PUBLISH_PROVIDER === 'mock') {
        components.push({ name: 'publishIntegration', status: 'AVAILABLE', detail: 'Mock publish adapter — no external dependency.' });
      } else if (env.FACEBOOK_PAGE_ACCESS_TOKEN) {
        components.push({ name: 'publishIntegration', status: 'CONFIGURED', detail: 'Facebook publish adapter — credentials present.' });
      } else {
        components.push({ name: 'publishIntegration', status: 'NOT_CONFIGURED', detail: 'PUBLISH_PROVIDER=facebook but FACEBOOK_PAGE_ACCESS_TOKEN is unset.' });
      }

      if (env.REVIEW_PROVIDER === 'mock') {
        components.push({ name: 'reviewIntegration', status: 'AVAILABLE', detail: 'Mock review provider — no external dependency.' });
      } else if (env.GOOGLE_BUSINESS_ACCESS_TOKEN && env.GOOGLE_BUSINESS_LOCATION_ID) {
        components.push({ name: 'reviewIntegration', status: 'CONFIGURED', detail: 'Google Business Profile — credentials present.' });
      } else {
        components.push({
          name: 'reviewIntegration',
          status: 'NOT_CONFIGURED',
          detail: 'REVIEW_PROVIDER=google_business but credentials are incomplete.',
        });
      }

      components.push({
        name: 'authentication',
        status: env.API_AUTH_TOKEN ? 'CONFIGURED' : 'NOT_CONFIGURED',
        detail: env.API_AUTH_TOKEN
          ? 'Bearer-token gate active on all routes.'
          : 'No API_AUTH_TOKEN set — API is unauthenticated (development only). See SECURITY.md.',
      });

      res.json({ components });
    }),
  );

  return router;
}
