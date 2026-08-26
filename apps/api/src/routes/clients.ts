import { Router } from 'express';
import { clientRepository, contentRepository } from '@citadel/database';
import { CreateClientInputSchema, UpdateClientInputSchema } from '@citadel/shared';
import { asyncHandler } from './async-handler.js';

export function clientsRouter(): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const clients = await clientRepository.list();
      res.json({ clients });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = CreateClientInputSchema.parse(req.body);
      const client = await clientRepository.create(input);
      res.status(201).json({ client });
    }),
  );

  router.get(
    '/:idOrSlug',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      res.json({ client });
    }),
  );

  router.patch(
    '/:idOrSlug',
    asyncHandler(async (req, res) => {
      const input = UpdateClientInputSchema.parse(req.body);
      const client = await clientRepository.update(req.params.idOrSlug as string, input);
      res.json({ client });
    }),
  );

  router.get(
    '/:idOrSlug/content',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const items = await contentRepository.listByClient(client.id);
      res.json({ contentItems: items });
    }),
  );

  return router;
}
