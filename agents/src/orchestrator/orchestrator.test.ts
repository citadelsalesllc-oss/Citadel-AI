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
          task: 'seo_audit',
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
});
