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
  seoAuditRepository,
  getClientContext,
} from '@citadel/database';
import {
  CitadelError,
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
import type { Orchestrator } from '@citadel/agents';
import type { CreateSocialPostOutput, SeoAuditOutput } from '@citadel/skills';
import { z } from 'zod';
import { asyncHandler } from './async-handler.js';
import { logGenerationEvent, logSeoAuditEvent } from '../logger.js';

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
export function clientsRouter(orchestrator: Orchestrator, modelProviderName: string): Router {
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
        initialStatus: 'DRAFT',
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

  // --- AI generation (Phase 3) --------------------------------------------------------
  // USER REQUEST -> ORCHESTRATOR -> CLIENT CONTEXT -> CONTENT AGENT -> AI
  // MODEL -> BRAND/FACTUAL QA -> SAVE -> RETURN RESULT. See
  // agents/src/orchestrator/orchestrator.ts's generateContent() for the
  // actual pipeline; this route only translates between HTTP and that
  // call, and logs the observability event either way.

  const GenerateContentBodySchema = z.object({
    task: z.string().min(1),
    platform: z.string().min(1),
    topic: z.string().min(1),
    userInstructions: z.string().optional(),
  });

  router.post(
    '/:idOrSlug/ai/generate',
    asyncHandler(async (req, res) => {
      const body = GenerateContentBodySchema.parse(req.body);
      const clientIdOrSlug = req.params.idOrSlug as string;
      const startedAt = Date.now();

      try {
        const outcome = await orchestrator.generateContent({
          clientIdOrSlug,
          task: body.task,
          platform: body.platform,
          topic: body.topic,
          userInstructions: body.userInstructions,
          actor: req.actor,
          requestId: req.requestId,
        });

        const result = outcome.result as CreateSocialPostOutput;

        logGenerationEvent({
          requestId: req.requestId,
          clientId: result.contentItem.clientId,
          agent: outcome.skillName,
          task: body.task,
          modelProvider: result.providerUsed,
          executionTimeMs: Date.now() - startedAt,
          success: true,
          qaPassed: result.qa.passed,
          contentStatus: result.contentItem.status,
        });

        res.json({
          content: {
            platform: result.generation.platform.toUpperCase(),
            content: result.generation.content,
            hashtags: result.generation.hashtags,
            cta: result.generation.cta,
            seo_keywords_used: result.generation.seoKeywordsUsed,
            notes: result.generation.notes,
          },
          qaResult: {
            passed: result.qa.passed,
            issues: result.qa.issues,
            warnings: result.qa.warnings,
          },
          contentId: result.contentItem.id,
          status: result.contentItem.status,
          agentUsed: outcome.skillName,
          modelProvider: { name: result.providerUsed, model: result.modelUsed },
          usage: result.generation.usage ?? null,
        });
      } catch (error) {
        logGenerationEvent({
          requestId: req.requestId,
          clientId: clientIdOrSlug,
          agent: 'content-agent',
          task: body.task,
          modelProvider: modelProviderName,
          executionTimeMs: Date.now() - startedAt,
          success: false,
          errorCode: error instanceof CitadelError ? error.code : 'UNKNOWN_ERROR',
        });
        throw error;
      }
    }),
  );

  // --- SEO audit (Phase 4) ------------------------------------------------------------
  // USER REQUEST -> ORCHESTRATOR -> CLIENT CONTEXT -> WEBSITE FETCH -> SEO
  // AGENT (deterministic checks + LLM-prioritized recommendations) -> SAVE
  // -> RETURN RESULT. See agents/src/orchestrator/orchestrator.ts's
  // runSeoAudit() for the actual pipeline; this route only translates
  // between HTTP and that call, and logs the observability event either way.

  const SeoAuditBodySchema = z.object({
    url: z.string().url(),
    target_service: z.string().optional(),
    target_location: z.string().optional(),
    instructions: z.string().optional(),
  });

  router.post(
    '/:idOrSlug/ai/seo-audit',
    asyncHandler(async (req, res) => {
      const body = SeoAuditBodySchema.parse(req.body);
      const clientIdOrSlug = req.params.idOrSlug as string;
      const startedAt = Date.now();

      try {
        const outcome = await orchestrator.runSeoAudit({
          clientIdOrSlug,
          task: 'seo_audit',
          url: body.url,
          targetService: body.target_service,
          targetLocation: body.target_location,
          userInstructions: body.instructions,
          actor: req.actor,
          requestId: req.requestId,
        });

        const result = outcome.result as SeoAuditOutput;
        const { audit, auditRecord } = result;

        logSeoAuditEvent({
          requestId: req.requestId,
          clientId: auditRecord.clientId,
          agent: outcome.skillName,
          task: 'seo_audit',
          modelProvider: audit.providerUsed,
          executionTimeMs: Date.now() - startedAt,
          success: true,
          overallScore: audit.overallScore,
        });

        res.json({
          audit: {
            url: audit.url,
            overall_score: audit.overallScore,
            technical: audit.technical,
            on_page: audit.onPage,
            local_seo: audit.localSeo,
            conversion: audit.conversion,
            keyword_opportunities: audit.keywordOpportunities,
          },
          evidence: audit.evidence,
          recommendations: audit.recommendations,
          clientId: auditRecord.clientId,
          auditId: auditRecord.id,
          agentUsed: outcome.skillName,
          modelProvider: { name: audit.providerUsed, model: audit.modelUsed },
          usage: audit.usage ?? null,
          executionTimeMs: Date.now() - startedAt,
        });
      } catch (error) {
        logSeoAuditEvent({
          requestId: req.requestId,
          clientId: clientIdOrSlug,
          agent: 'seo-agent',
          task: 'seo_audit',
          modelProvider: modelProviderName,
          executionTimeMs: Date.now() - startedAt,
          success: false,
          errorCode: error instanceof CitadelError ? error.code : 'UNKNOWN_ERROR',
        });
        throw error;
      }
    }),
  );

  router.get(
    '/:idOrSlug/seo-audits',
    asyncHandler(async (req, res) => {
      const client = await clientRepository.requireByIdOrSlug(req.params.idOrSlug as string);
      const url = typeof req.query.url === 'string' ? req.query.url : undefined;
      const seoAudits = await seoAuditRepository.listByClient(client.id, url);
      res.json({ seoAudits });
    }),
  );

  return router;
}
