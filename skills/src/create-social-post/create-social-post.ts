import { z } from 'zod';
import {
  type ClientContext,
  type ContentItem,
  type Skill,
  type SkillContext,
  type ToolRegistry,
} from '@citadel/shared';
import {
  ContentAgent,
  ContentPlatformSchema,
  BrandQaAgent,
  type ContentAgentOutput,
  type BrandQaResult,
} from '@citadel/agents';

const PREVIOUS_CONTENT_LIMIT = 3;

export const CreateSocialPostInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  platform: ContentPlatformSchema,
  topic: z.string().min(1),
  userInstructions: z.string().optional(),
});
export type CreateSocialPostInput = z.infer<typeof CreateSocialPostInputSchema>;

export interface CreateSocialPostOutput {
  contentItem: ContentItem;
  generation: ContentAgentOutput;
  qa: BrandQaResult;
  modelUsed: string;
  providerUsed: string;
}

export interface CreateSocialPostDeps {
  toolRegistry: ToolRegistry;
  contentAgent: ContentAgent;
  brandQaAgent: BrandQaAgent;
}

/**
 * Complete, user-facing "create a social post" workflow: load client
 * context -> retrieve relevant previous content -> generate structured,
 * on-brand copy -> run Brand QA -> save. This is the one fully
 * end-to-end content workflow (see AGENTS.md); every other skill folder
 * is a placeholder for a future phase.
 *
 * Unlike Phase 1/2, this ALWAYS saves a result — never throws on a failed
 * QA pass. A passing result is saved DRAFT; a failing one is saved
 * REVISION_REQUIRED (see prisma schema's content lifecycle) so a human
 * can see and fix exactly what tripped QA, rather than the generation
 * silently vanishing. Both count as skill "success" — the QA outcome is
 * data in the result, not a thrown error.
 */
export function createCreateSocialPostSkill(deps: CreateSocialPostDeps): Skill<CreateSocialPostInput, CreateSocialPostOutput> {
  return {
    name: 'create-social-post',
    description: 'Create an on-brand Facebook post for a client and save it as a draft (or flag it for revision if it fails Brand QA).',
    inputSchema: CreateSocialPostInputSchema,
    async run(input, context: SkillContext): Promise<CreateSocialPostOutput> {
      const client = await deps.toolRegistry.call<ClientContext>(
        'client_context',
        { idOrSlug: input.clientIdOrSlug },
        { actor: context.actor, requestId: context.requestId },
      );

      // Structured retrieval only (no vector search) — recent content for
      // the same platform, newest first, bodies only. Used for voice
      // consistency; the Content Agent is explicitly told not to copy it.
      const priorItems = await deps.toolRegistry.call<ContentItem[]>(
        'content_search',
        { clientId: client.core.id },
        { actor: context.actor, requestId: context.requestId, clientId: client.core.id },
      );
      const previousContent = priorItems
        .filter((item) => item.platform === input.platform)
        .slice(0, PREVIOUS_CONTENT_LIMIT)
        .map((item) => item.body);

      const generation = await deps.contentAgent.run(
        { platform: input.platform, topic: input.topic, userInstructions: input.userInstructions, previousContent },
        { client, actor: context.actor, requestId: context.requestId },
      );

      const qa = await deps.brandQaAgent.run(
        { content: generation.content, hashtags: generation.hashtags, cta: generation.cta, platform: generation.platform },
        { client, actor: context.actor, requestId: context.requestId },
      );

      const contentItem = await deps.toolRegistry.call<ContentItem>(
        'content_save',
        {
          clientId: client.core.id,
          type: generation.contentType,
          platform: input.platform,
          body: generation.content,
          metadata: {
            agent: 'create-social-post',
            topic: input.topic,
            userInstructions: input.userInstructions,
            hashtags: generation.hashtags,
            cta: generation.cta,
            seoKeywordsUsed: generation.seoKeywordsUsed,
            generationNotes: generation.notes,
            modelUsed: generation.modelUsed,
            providerUsed: generation.providerUsed,
            qaIssues: qa.issues,
            qaWarnings: qa.warnings,
          },
          initialStatus: qa.passed ? 'DRAFT' : 'REVISION_REQUIRED',
        },
        { actor: context.actor, requestId: context.requestId, clientId: client.core.id },
      );

      return {
        contentItem,
        generation,
        qa,
        modelUsed: generation.modelUsed,
        providerUsed: generation.providerUsed,
      };
    },
  };
}
