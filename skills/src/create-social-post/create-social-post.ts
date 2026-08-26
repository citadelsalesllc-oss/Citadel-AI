import { z } from 'zod';
import {
  BrandQaFailedError,
  type ClientContext,
  type ContentItem,
  type Skill,
  type SkillContext,
  type ToolRegistry,
} from '@citadel/shared';
import { ContentAgent, ContentPlatformSchema, BrandQaAgent, type BrandQaResult } from '@citadel/agents';

export const CreateSocialPostInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  platform: ContentPlatformSchema,
  instruction: z.string().min(1),
});
export type CreateSocialPostInput = z.infer<typeof CreateSocialPostInputSchema>;

export interface CreateSocialPostOutput {
  contentItem: ContentItem;
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
 * context -> generate on-brand copy -> run Brand QA -> persist as DRAFT.
 * This is the one fully end-to-end workflow for the MVP (see AGENTS.md);
 * every other skill folder is a placeholder for a future phase.
 */
export function createCreateSocialPostSkill(deps: CreateSocialPostDeps): Skill<CreateSocialPostInput, CreateSocialPostOutput> {
  return {
    name: 'create-social-post',
    description: "Create an on-brand social/content post for a client (Facebook, Instagram, Google Business, blog, website, or email) and save it as a draft.",
    inputSchema: CreateSocialPostInputSchema,
    async run(input, context: SkillContext): Promise<CreateSocialPostOutput> {
      const client = await deps.toolRegistry.call<ClientContext>(
        'client_context',
        { idOrSlug: input.clientIdOrSlug },
        { actor: context.actor, requestId: context.requestId },
      );

      const generation = await deps.contentAgent.run(
        { platform: input.platform, instruction: input.instruction },
        { client, actor: context.actor, requestId: context.requestId },
      );

      const qa = await deps.brandQaAgent.run(
        { body: generation.body },
        { client, actor: context.actor, requestId: context.requestId },
      );

      if (!qa.passed) {
        throw new BrandQaFailedError(
          qa.issues.filter((issue) => issue.severity === 'blocking').map((issue) => issue.message),
        );
      }

      const contentItem = await deps.toolRegistry.call<ContentItem>(
        'content_save',
        {
          clientId: client.core.id,
          type: generation.contentType,
          platform: input.platform,
          body: generation.body,
          metadata: {
            instruction: input.instruction,
            modelUsed: generation.modelUsed,
            providerUsed: generation.providerUsed,
            qaWarnings: qa.issues.filter((issue) => issue.severity === 'warning'),
          },
        },
        { actor: context.actor, requestId: context.requestId, clientId: client.core.id },
      );

      return {
        contentItem,
        qa,
        modelUsed: generation.modelUsed,
        providerUsed: generation.providerUsed,
      };
    },
  };
}
