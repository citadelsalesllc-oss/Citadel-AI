import { Router } from 'express';
import { z } from 'zod';
import { contentRepository, clientRepository } from '@citadel/database';
import type { ToolRegistry } from '@citadel/shared';
import { asyncHandler } from './async-handler.js';

const ClientQuerySchema = z.object({ clientIdOrSlug: z.string().min(1) });
const ReviewerBodySchema = z.object({ clientIdOrSlug: z.string().min(1), reviewer: z.string().min(1) });
const RejectBodySchema = z.object({
  clientIdOrSlug: z.string().min(1),
  reviewer: z.string().min(1),
  reason: z.string().min(1),
});
const SubmitForReviewBodySchema = z.object({ clientIdOrSlug: z.string().min(1) });
const PublishBodySchema = z.object({
  clientIdOrSlug: z.string().min(1),
  platform: z.enum(['facebook', 'instagram', 'google_business']),
});

/**
 * Every route here requires `clientIdOrSlug` — the caller's declared
 * "authorized client/context" — and resolves it BEFORE touching the
 * content item, so a content id belonging to a different client can never
 * be read, approved, rejected, or published through this route (see
 * database/src/repositories/content-repository.ts's (id, clientId)
 * scoping, and TOOLS.md). GET uses a query param (no request body on a
 * GET); the action routes use the request body, matching how every other
 * write in this API already takes its client scope.
 */
export function contentRouter(toolRegistry: ToolRegistry): Router {
  const router = Router();

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const query = ClientQuerySchema.parse(req.query);
      const client = await clientRepository.requireByIdOrSlug(query.clientIdOrSlug);
      const item = await contentRepository.requireByIdForClient(client.id, req.params.id as string);
      res.json({ contentItem: item });
    }),
  );

  router.post(
    '/:id/submit-for-review',
    asyncHandler(async (req, res) => {
      const body = SubmitForReviewBodySchema.parse(req.body);
      const item = await toolRegistry.call(
        'approval_request',
        { clientIdOrSlug: body.clientIdOrSlug, contentId: req.params.id },
        { actor: req.actor, requestId: req.requestId },
      );
      res.json({ contentItem: item });
    }),
  );

  router.post(
    '/:id/approve',
    asyncHandler(async (req, res) => {
      const body = ReviewerBodySchema.parse(req.body);
      const item = await toolRegistry.call(
        'content_approve',
        { clientIdOrSlug: body.clientIdOrSlug, contentId: req.params.id, reviewer: body.reviewer },
        { actor: req.actor, requestId: req.requestId },
      );
      res.json({ contentItem: item });
    }),
  );

  router.post(
    '/:id/reject',
    asyncHandler(async (req, res) => {
      const body = RejectBodySchema.parse(req.body);
      const item = await toolRegistry.call(
        'content_reject',
        { clientIdOrSlug: body.clientIdOrSlug, contentId: req.params.id, reviewer: body.reviewer, reason: body.reason },
        { actor: req.actor, requestId: req.requestId },
      );
      res.json({ contentItem: item });
    }),
  );

  router.post(
    '/:id/request-revision',
    asyncHandler(async (req, res) => {
      const body = RejectBodySchema.parse(req.body);
      const item = await toolRegistry.call(
        'content_request_revision',
        { clientIdOrSlug: body.clientIdOrSlug, contentId: req.params.id, reviewer: body.reviewer, reason: body.reason },
        { actor: req.actor, requestId: req.requestId },
      );
      res.json({ contentItem: item });
    }),
  );

  router.post(
    '/:id/publish',
    asyncHandler(async (req, res) => {
      const body = PublishBodySchema.parse(req.body);
      const item = await toolRegistry.call(
        'publish_content',
        { clientIdOrSlug: body.clientIdOrSlug, contentId: req.params.id, platform: body.platform },
        { actor: req.actor, requestId: req.requestId },
      );
      res.json({ contentItem: item });
    }),
  );

  return router;
}
