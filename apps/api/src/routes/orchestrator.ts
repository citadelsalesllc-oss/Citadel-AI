import { Router } from 'express';
import { z } from 'zod';
import type { Orchestrator } from '@citadel/agents';
import { asyncHandler } from './async-handler.js';

const OrchestratorRequestBodySchema = z.object({
  clientIdOrSlug: z.string().min(1),
  instruction: z.string().min(1),
});

export function orchestratorRouter(orchestrator: Orchestrator): Router {
  const router = Router();

  router.post(
    '/requests',
    asyncHandler(async (req, res) => {
      const body = OrchestratorRequestBodySchema.parse(req.body);
      const result = await orchestrator.handle({
        clientIdOrSlug: body.clientIdOrSlug,
        instruction: body.instruction,
        actor: req.actor,
        requestId: req.requestId,
      });
      res.json({ result });
    }),
  );

  return router;
}
