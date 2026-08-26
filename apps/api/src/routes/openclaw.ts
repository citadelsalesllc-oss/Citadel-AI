import { Router } from 'express';
import type { OpenClawToolDefinition } from '@citadel/integrations/openclaw';

/**
 * Exposes the skill registry in OpenClaw-compatible tool-definition shape.
 * This is a read-only introspection endpoint for now — see OPENCLAW.md for
 * how an OpenClaw runtime would register and invoke these.
 */
export function openClawRouter(tools: OpenClawToolDefinition[]): Router {
  const router = Router();

  router.get('/tools', (_req, res) => {
    res.json({
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  });

  return router;
}
