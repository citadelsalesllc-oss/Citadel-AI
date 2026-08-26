import { Router } from 'express';
import { z } from 'zod';
import { contentRepository } from '@citadel/database';
import type { ToolRegistry } from '@citadel/shared';
import { asyncHandler } from './async-handler.js';

const ReviewerBodySchema = z.object({ reviewer: z.string().min(1) });
const RejectBodySchema = z.object({ reviewer: z.string().min(1), reason: z.string().min(1) });
const PublishBodySchema = z.object({ platform: z.enum(['facebook', 'instagram', 'google_business']) });

export function contentRouter(toolRegistry: ToolRegistry): Router {
  const router = Router();

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const item = await contentRepository.findById(req.params.id as string);
      if (!item) {
        res.status(404).json({ error: { message: 'Content item not found', code: 'NOT_FOUND' } });
        return;
      }
      res.json({ contentItem: item });
    }),
  );

  router.post(
    '/:id/submit-for-review',
    asyncHandler(async (req, res) => {
      const item = await toolRegistry.call(
        'approval_request',
        { contentId: req.params.id },
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
        { contentId: req.params.id, reviewer: body.reviewer },
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
        { contentId: req.params.id, reviewer: body.reviewer, reason: body.reason },
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
        { contentId: req.params.id, reviewer: body.reviewer, reason: body.reason },
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
        { contentId: req.params.id, platform: body.platform },
        { actor: req.actor, requestId: req.requestId },
      );
      res.json({ contentItem: item });
    }),
  );

  return router;
}
