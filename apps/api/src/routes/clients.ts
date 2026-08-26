import { Router } from 'express';
import {
  clientRepository,
  contentRepository,
  serviceRepository,
  serviceAreaRepository,
  brandProfileRepository,
  targetAudienceRepository,
  seoProfileRepository,
  offerRepository,
  faqRepository,
  marketingNoteRepository,
  getClientContext,
} from '@citadel/database';
import {
  CreateClientInputSchema,
  UpdateClientInputSchema,
  CreateServiceInputSchema,
  UpdateServiceInputSchema,
  CreateServiceAreaInputSchema,
  UpdateBrandProfileInputSchema,
  UpdateTargetAudienceInputSchema,
  UpdateSeoProfileInputSchema,
  CreateOfferInputSchema,
  CreateFaqInputSchema,
  CreateMarketingNoteInputSchema,
  ContentTypeSchema,
} from '@citadel/shared';
import { z } from 'zod';
import { asyncHandler } from './async-handler.js';

/**
 * All client knowledge sub-resources (services, service areas, brand
 * profile, SEO profile, target audience, offers, FAQs, marketing notes,
 * content, and the aggregated context) live under /clients/:idOrSlug/... —
 * this is the "clean API/service endpoints" surface from the Phase 2
 * spec. Every route resolves the client via clientRepository first, so an
 * unknown client id/slug fails with a clean 404 before any child-table
 * query runs, and every child record is created with THAT resolved
 * client's real id — never a caller-supplied one — which is what makes
 * cross-tenant writes structurally impossible here.
 */
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

  // --- Client context (knowledge retrieval) ---------------------------------

  router.get(
    '/:idOrSlug/context',
    asyncHandler(async (req, res) => {
      const context = await getClientContext(req.params.idOrSlug as string);
      res.json({ context });
    }),
  );

  // --- Services ---------------------------------------------------------------

  router.post(
    '/:idOrSlug/services',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = CreateServiceInputSchema.parse(req.body);
      const service = await serviceRepository.add(client.id, input);
      res.status(201).json({ service });
    }),
  );

  router.patch(
    '/:idOrSlug/services/:serviceId',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = UpdateServiceInputSchema.parse(req.body);
      const service = await serviceRepository.update(client.id, req.params.serviceId as string, input);
      res.json({ service });
    }),
  );

  router.get(
    '/:idOrSlug/services',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const services = await serviceRepository.listByClient(client.id);
      res.json({ services });
    }),
  );

  // --- Service areas ------------------------------------------------------------

  router.post(
    '/:idOrSlug/service-areas',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = CreateServiceAreaInputSchema.parse(req.body);
      const serviceArea = await serviceAreaRepository.add(client.id, input);
      res.status(201).json({ serviceArea });
    }),
  );

  router.get(
    '/:idOrSlug/service-areas',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const serviceAreas = await serviceAreaRepository.listByClient(client.id);
      res.json({ serviceAreas });
    }),
  );

  // --- Brand profile (1:1) -------------------------------------------------------

  router.put(
    '/:idOrSlug/brand-profile',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = UpdateBrandProfileInputSchema.parse(req.body);
      const brandProfile = await brandProfileRepository.upsert(client.id, input);
      res.json({ brandProfile });
    }),
  );

  router.get(
    '/:idOrSlug/brand-profile',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const brandProfile = await brandProfileRepository.getByClient(client.id);
      res.json({ brandProfile });
    }),
  );

  // --- Target audience (1:1) ------------------------------------------------------
  // Also not in the spec's literal API list (same gap as Offers, above) —
  // added because objective item 8 ("store target customers") and the full
  // Target Audience data-model section require a write path.

  router.put(
    '/:idOrSlug/target-audience',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = UpdateTargetAudienceInputSchema.parse(req.body);
      const targetAudience = await targetAudienceRepository.upsert(client.id, input);
      res.json({ targetAudience });
    }),
  );

  router.get(
    '/:idOrSlug/target-audience',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const targetAudience = await targetAudienceRepository.getByClient(client.id);
      res.json({ targetAudience });
    }),
  );

  // --- SEO profile (1:1) -----------------------------------------------------------

  router.put(
    '/:idOrSlug/seo-profile',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = UpdateSeoProfileInputSchema.parse(req.body);
      const seoProfile = await seoProfileRepository.upsert(client.id, input);
      res.json({ seoProfile });
    }),
  );

  router.get(
    '/:idOrSlug/seo-profile',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const seoProfile = await seoProfileRepository.getByClient(client.id);
      res.json({ seoProfile });
    }),
  );

  // --- Offers -----------------------------------------------------------------------
  // Not in the Phase 2 spec's literal API list, but the data model and
  // objective ("11. Store offers") require a way to write them — see
  // ARCHITECTURE.md for this gap-fill decision.

  router.post(
    '/:idOrSlug/offers',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = CreateOfferInputSchema.parse(req.body);
      const offer = await offerRepository.add(client.id, input);
      res.status(201).json({ offer });
    }),
  );

  router.get(
    '/:idOrSlug/offers',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const offers = await offerRepository.listByClient(client.id);
      res.json({ offers });
    }),
  );

  // --- FAQs -----------------------------------------------------------------------

  router.post(
    '/:idOrSlug/faqs',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = CreateFaqInputSchema.parse(req.body);
      const faq = await faqRepository.add(client.id, input);
      res.status(201).json({ faq });
    }),
  );

  router.get(
    '/:idOrSlug/faqs',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const faqs = await faqRepository.listByClient(client.id);
      res.json({ faqs });
    }),
  );

  // --- Marketing notes ---------------------------------------------------------------

  router.post(
    '/:idOrSlug/marketing-notes',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = CreateMarketingNoteInputSchema.parse(req.body);
      const marketingNote = await marketingNoteRepository.add(client.id, input);
      res.status(201).json({ marketingNote });
    }),
  );

  router.get(
    '/:idOrSlug/marketing-notes',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const marketingNotes = await marketingNoteRepository.listByClient(client.id);
      res.json({ marketingNotes });
    }),
  );

  // --- Content (storage only — no publishing in this phase) --------------------------

  const SaveContentBodySchema = z.object({
    type: ContentTypeSchema,
    platform: z.string().optional(),
    title: z.string().optional(),
    body: z.string().min(1),
    campaign: z.string().optional(),
    tags: z.array(z.string()).default([]),
  });

  router.post(
    '/:idOrSlug/content',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const input = SaveContentBodySchema.parse(req.body);
      const contentItem = await contentRepository.create({
        clientId: client.id,
        type: input.type,
        platform: input.platform,
        title: input.title,
        body: input.body,
        campaign: input.campaign,
        tags: input.tags,
        metadata: {},
        createdBy: req.actor.label,
      });
      res.status(201).json({ contentItem });
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
