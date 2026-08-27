import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AgentRegistry,
  ClientNotActiveError,
  ClientNotFoundError,
  NotImplementedError,
  SkillRegistry,
  ToolRegistry,
  type ClientContext,
} from '@citadel/shared';
import { makeTestClient } from '../test-fixtures.js';
import { createStubAgent } from '../stub-agent.js';
import { Orchestrator } from './orchestrator.js';

const ACTOR = { id: 'test', label: 'Test Actor' };

function buildToolRegistry(client: ClientContext) {
  const registry = new ToolRegistry();
  registry.register({
    name: 'client_context',
    description: 'fake',
    inputSchema: z.object({ idOrSlug: z.string() }),
    async execute(input: { idOrSlug: string }) {
      if (input.idOrSlug !== client.core.id && input.idOrSlug !== client.core.slug) {
        throw new ClientNotFoundError(input.idOrSlug);
      }
      return client;
    },
  });
  return registry;
}

function buildSkillRegistry(handler?: (input: unknown) => unknown) {
  const registry = new SkillRegistry();
  registry.register({
    name: 'create-social-post',
    description: 'fake',
    inputSchema: z.object({}).passthrough(),
    async run(input) {
      return handler ? handler(input) : { contentItem: { id: 'content_1' }, qa: { passed: true, issues: [], warnings: [] } };
    },
  });
  return registry;
}

function buildSeoAuditSkillRegistry(handler?: (input: unknown) => unknown) {
  const registry = new SkillRegistry();
  registry.register({
    name: 'seo-audit',
    description: 'fake',
    inputSchema: z.object({}).passthrough(),
    async run(input) {
      return handler ? handler(input) : { auditRecord: { id: 'audit_1' }, audit: { overallScore: 80 } };
    },
  });
  return registry;
}

function buildReviewSkillRegistry(skillName: 'review-analyze' | 'review-respond', handler?: (input: unknown) => unknown) {
  const registry = new SkillRegistry();
  registry.register({
    name: skillName,
    description: 'fake',
    inputSchema: z.object({}).passthrough(),
    async run(input) {
      return handler
        ? handler(input)
        : skillName === 'review-analyze'
          ? { review: { id: 'review_1' }, analysis: { classification: 'positive' } }
          : { review: { id: 'review_1', responseStatus: 'DRAFT' }, generation: { response: 'Thanks!' }, qa: { passed: true, issues: [], warnings: [] } };
    },
  });
  return registry;
}

describe('Orchestrator', () => {
  describe('handle (free-text entry point)', () => {
    it('routes a Facebook-flavored instruction to the create-social-post skill', async () => {
      const client = makeTestClient();
      const skillRun = vi.fn().mockResolvedValue({ contentItem: { id: 'c1' }, qa: { passed: true, issues: [], warnings: [] } });
      const skillRegistry = buildSkillRegistry(skillRun);
      const orchestrator = new Orchestrator(buildToolRegistry(client), skillRegistry, new AgentRegistry());

      const result = await orchestrator.handle({
        clientIdOrSlug: client.core.slug,
        instruction: 'Create a Facebook post about our new service.',
        actor: ACTOR,
        requestId: 'req-1',
      });

      expect(result.status).toBe('completed');
      expect(skillRun).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'facebook', topic: 'Create a Facebook post about our new service.' }),
      );
    });

    it('routes to a registered specialist agent and reports its honest not-implemented result', async () => {
      const client = makeTestClient();
      const agentRegistry = new AgentRegistry();
      agentRegistry.register(createStubAgent('seo-agent', 'SEO work'));
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSkillRegistry(), agentRegistry);

      const result = await orchestrator.handle({
        clientIdOrSlug: client.core.slug,
        instruction: 'Run an SEO audit on our homepage.',
        actor: ACTOR,
        requestId: 'req-2',
      });

      expect(result).toMatchObject({ status: 'not_implemented' });
    });

    it('reports unsupported requests explicitly without touching a skill or agent', async () => {
      const client = makeTestClient();
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSkillRegistry(), new AgentRegistry());

      const result = await orchestrator.handle({
        clientIdOrSlug: client.core.slug,
        instruction: 'What is the weather today?',
        actor: ACTOR,
        requestId: 'req-3',
      });

      expect(result).toMatchObject({ status: 'unsupported' });
    });

    it('throws ClientNotFoundError for an unknown client rather than inventing one', async () => {
      const client = makeTestClient();
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSkillRegistry(), new AgentRegistry());

      await expect(
        orchestrator.handle({
          clientIdOrSlug: 'does-not-exist',
          instruction: 'Create a Facebook post.',
          actor: ACTOR,
          requestId: 'req-4',
        }),
      ).rejects.toThrow(ClientNotFoundError);
    });

    it('refuses to act on an archived client', async () => {
      const client = makeTestClient({ core: { ...makeTestClient().core, status: 'ARCHIVED' } });
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSkillRegistry(), new AgentRegistry());

      await expect(
        orchestrator.handle({
          clientIdOrSlug: client.core.slug,
          instruction: 'Create a Facebook post.',
          actor: ACTOR,
          requestId: 'req-5',
        }),
      ).rejects.toThrow(ClientNotActiveError);
    });
  });

  describe('generateContent (structured entry point)', () => {
    it('identifies the client, retrieves context, and delegates to the content skill for create_social_post', async () => {
      const client = makeTestClient();
      const skillRun = vi.fn().mockResolvedValue({
        contentItem: { id: 'c1', status: 'DRAFT' },
        qa: { passed: true, issues: [], warnings: [] },
      });
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSkillRegistry(skillRun), new AgentRegistry());

      const outcome = await orchestrator.generateContent({
        clientIdOrSlug: client.core.slug,
        task: 'create_social_post',
        platform: 'FACEBOOK',
        topic: 'a septic installation',
        actor: ACTOR,
        requestId: 'req-6',
      });

      expect(outcome.status).toBe('completed');
      expect(outcome.skillName).toBe('create-social-post');
      expect(skillRun).toHaveBeenCalledWith(
        expect.objectContaining({ clientIdOrSlug: client.core.slug, platform: 'facebook', topic: 'a septic installation' }),
      );
    });

    it('reports an unsupported task honestly instead of guessing an agent', async () => {
      const client = makeTestClient();
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSkillRegistry(), new AgentRegistry());

      await expect(
        orchestrator.generateContent({
          clientIdOrSlug: client.core.slug,
          task: 'website_audit',
          platform: 'FACEBOOK',
          topic: 'anything',
          actor: ACTOR,
          requestId: 'req-7',
        }),
      ).rejects.toThrow(NotImplementedError);
    });

    it('throws ClientNotFoundError for an invalid client instead of inventing one', async () => {
      const client = makeTestClient();
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSkillRegistry(), new AgentRegistry());

      await expect(
        orchestrator.generateContent({
          clientIdOrSlug: 'does-not-exist',
          task: 'create_social_post',
          platform: 'FACEBOOK',
          topic: 'anything',
          actor: ACTOR,
          requestId: 'req-8',
        }),
      ).rejects.toThrow(ClientNotFoundError);
    });

    it('propagates a downstream failure (e.g. a database error saving the result) rather than fabricating success', async () => {
      const client = makeTestClient();
      const skillRegistry = buildSkillRegistry(() => {
        throw new Error('connection to database lost');
      });
      const orchestrator = new Orchestrator(buildToolRegistry(client), skillRegistry, new AgentRegistry());

      await expect(
        orchestrator.generateContent({
          clientIdOrSlug: client.core.slug,
          task: 'create_social_post',
          platform: 'FACEBOOK',
          topic: 'anything',
          actor: ACTOR,
          requestId: 'req-9',
        }),
      ).rejects.toThrow('connection to database lost');
    });
  });

  describe('runSeoAudit (structured entry point, Phase 4)', () => {
    it('identifies the client and delegates to the seo-audit skill', async () => {
      const client = makeTestClient();
      const skillRun = vi.fn().mockResolvedValue({ auditRecord: { id: 'audit_1' }, audit: { overallScore: 72 } });
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSeoAuditSkillRegistry(skillRun), new AgentRegistry());

      const outcome = await orchestrator.runSeoAudit({
        clientIdOrSlug: client.core.slug,
        task: 'seo_audit',
        url: 'https://example.com/',
        actor: ACTOR,
        requestId: 'req-10',
      });

      expect(outcome.status).toBe('completed');
      expect(outcome.skillName).toBe('seo-audit');
      expect(skillRun).toHaveBeenCalledWith(
        expect.objectContaining({ clientIdOrSlug: client.core.slug, url: 'https://example.com/' }),
      );
    });

    it('passes through optional target service/location/instructions', async () => {
      const client = makeTestClient();
      const skillRun = vi.fn().mockResolvedValue({ auditRecord: { id: 'audit_1' }, audit: { overallScore: 72 } });
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSeoAuditSkillRegistry(skillRun), new AgentRegistry());

      await orchestrator.runSeoAudit({
        clientIdOrSlug: client.core.slug,
        task: 'seo_audit',
        url: 'https://example.com/',
        targetService: 'widget installation',
        targetLocation: "Coeur d'Alene",
        userInstructions: 'focus on the homepage',
        actor: ACTOR,
        requestId: 'req-11',
      });

      expect(skillRun).toHaveBeenCalledWith(
        expect.objectContaining({ targetService: 'widget installation', targetLocation: "Coeur d'Alene", userInstructions: 'focus on the homepage' }),
      );
    });

    it('reports an unsupported task honestly instead of guessing a skill', async () => {
      const client = makeTestClient();
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSeoAuditSkillRegistry(), new AgentRegistry());

      await expect(
        orchestrator.runSeoAudit({
          clientIdOrSlug: client.core.slug,
          task: 'website_audit',
          url: 'https://example.com/',
          actor: ACTOR,
          requestId: 'req-12',
        }),
      ).rejects.toThrow(NotImplementedError);
    });

    it('throws ClientNotFoundError for an invalid client instead of inventing one', async () => {
      const client = makeTestClient();
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSeoAuditSkillRegistry(), new AgentRegistry());

      await expect(
        orchestrator.runSeoAudit({
          clientIdOrSlug: 'does-not-exist',
          task: 'seo_audit',
          url: 'https://example.com/',
          actor: ACTOR,
          requestId: 'req-13',
        }),
      ).rejects.toThrow(ClientNotFoundError);
    });

    it('does not resolve seo_audit against a client scoped to a different tenant\'s tool registry', async () => {
      const clientA = makeTestClient({ core: { ...makeTestClient().core, id: 'client_a', slug: 'client-a' } });
      const orchestrator = new Orchestrator(buildToolRegistry(clientA), buildSeoAuditSkillRegistry(), new AgentRegistry());

      await expect(
        orchestrator.runSeoAudit({
          clientIdOrSlug: 'client-b',
          task: 'seo_audit',
          url: 'https://example.com/',
          actor: ACTOR,
          requestId: 'req-14',
        }),
      ).rejects.toThrow(ClientNotFoundError);
    });
  });

  describe('regression: create_social_post is unaffected by seo_audit routing', () => {
    it('still resolves create_social_post to the create-social-post skill via the shared task lookup', async () => {
      const client = makeTestClient();
      const skillRun = vi.fn().mockResolvedValue({ contentItem: { id: 'c1' }, qa: { passed: true, issues: [], warnings: [] } });
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSkillRegistry(skillRun), new AgentRegistry());

      const outcome = await orchestrator.generateContent({
        clientIdOrSlug: client.core.slug,
        task: 'create_social_post',
        platform: 'FACEBOOK',
        topic: 'a septic installation',
        actor: ACTOR,
        requestId: 'req-15',
      });

      expect(outcome.status).toBe('completed');
      expect(outcome.skillName).toBe('create-social-post');
    });
  });

  describe('runReviewTask (structured entry point, Phase 5)', () => {
    it('identifies the client and delegates review_analyze to the review-analyze skill', async () => {
      const client = makeTestClient();
      const skillRun = vi.fn().mockResolvedValue({ review: { id: 'review_1' }, analysis: { classification: 'positive' } });
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildReviewSkillRegistry('review-analyze', skillRun), new AgentRegistry());

      const outcome = await orchestrator.runReviewTask({
        clientIdOrSlug: client.core.slug,
        task: 'review_analyze',
        reviewId: 'review_1',
        actor: ACTOR,
        requestId: 'req-16',
      });

      expect(outcome.status).toBe('completed');
      expect(outcome.skillName).toBe('review-analyze');
      expect(skillRun).toHaveBeenCalledWith(expect.objectContaining({ clientIdOrSlug: client.core.slug, reviewId: 'review_1' }));
    });

    it('identifies the client and delegates review_response to the review-respond skill', async () => {
      const client = makeTestClient();
      const skillRun = vi.fn().mockResolvedValue({
        review: { id: 'review_1', responseStatus: 'DRAFT' },
        generation: { response: 'Thank you!' },
        qa: { passed: true, issues: [], warnings: [] },
      });
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildReviewSkillRegistry('review-respond', skillRun), new AgentRegistry());

      const outcome = await orchestrator.runReviewTask({
        clientIdOrSlug: client.core.slug,
        task: 'review_response',
        reviewId: 'review_1',
        userInstructions: 'be brief',
        actor: ACTOR,
        requestId: 'req-17',
      });

      expect(outcome.status).toBe('completed');
      expect(outcome.skillName).toBe('review-respond');
      expect(skillRun).toHaveBeenCalledWith(
        expect.objectContaining({ clientIdOrSlug: client.core.slug, reviewId: 'review_1', userInstructions: 'be brief' }),
      );
    });

    it('reports an unsupported task honestly instead of guessing a skill', async () => {
      const client = makeTestClient();
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildReviewSkillRegistry('review-analyze'), new AgentRegistry());

      await expect(
        orchestrator.runReviewTask({
          clientIdOrSlug: client.core.slug,
          task: 'website_audit',
          reviewId: 'review_1',
          actor: ACTOR,
          requestId: 'req-18',
        }),
      ).rejects.toThrow(NotImplementedError);
    });

    it('throws ClientNotFoundError for an invalid client instead of inventing one', async () => {
      const client = makeTestClient();
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildReviewSkillRegistry('review-analyze'), new AgentRegistry());

      await expect(
        orchestrator.runReviewTask({
          clientIdOrSlug: 'does-not-exist',
          task: 'review_analyze',
          reviewId: 'review_1',
          actor: ACTOR,
          requestId: 'req-19',
        }),
      ).rejects.toThrow(ClientNotFoundError);
    });

    it('propagates a downstream failure (e.g. an invalid review id) rather than fabricating success', async () => {
      const client = makeTestClient();
      const skillRegistry = buildReviewSkillRegistry('review-analyze', () => {
        throw new Error('Review not found: does-not-exist');
      });
      const orchestrator = new Orchestrator(buildToolRegistry(client), skillRegistry, new AgentRegistry());

      await expect(
        orchestrator.runReviewTask({
          clientIdOrSlug: client.core.slug,
          task: 'review_analyze',
          reviewId: 'does-not-exist',
          actor: ACTOR,
          requestId: 'req-20',
        }),
      ).rejects.toThrow('Review not found');
    });
  });

  describe('regression: create_social_post and seo_audit are unaffected by review routing', () => {
    it('still resolves create_social_post to the create-social-post skill', async () => {
      const client = makeTestClient();
      const skillRun = vi.fn().mockResolvedValue({ contentItem: { id: 'c1' }, qa: { passed: true, issues: [], warnings: [] } });
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSkillRegistry(skillRun), new AgentRegistry());

      const outcome = await orchestrator.generateContent({
        clientIdOrSlug: client.core.slug,
        task: 'create_social_post',
        platform: 'FACEBOOK',
        topic: 'a septic installation',
        actor: ACTOR,
        requestId: 'req-21',
      });

      expect(outcome.status).toBe('completed');
      expect(outcome.skillName).toBe('create-social-post');
    });

    it('still resolves seo_audit to the seo-audit skill', async () => {
      const client = makeTestClient();
      const skillRun = vi.fn().mockResolvedValue({ auditRecord: { id: 'audit_1' }, audit: { overallScore: 80 } });
      const orchestrator = new Orchestrator(buildToolRegistry(client), buildSeoAuditSkillRegistry(skillRun), new AgentRegistry());

      const outcome = await orchestrator.runSeoAudit({
        clientIdOrSlug: client.core.slug,
        task: 'seo_audit',
        url: 'https://example.com/',
        actor: ACTOR,
        requestId: 'req-22',
      });

      expect(outcome.status).toBe('completed');
      expect(outcome.skillName).toBe('seo-audit');
    });
  });
});
