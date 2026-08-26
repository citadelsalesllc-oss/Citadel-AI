import { z } from 'zod';
import { clientRepository, contentRepository, auditRepository } from '@citadel/database';
import { InvalidLifecycleTransitionError, type ContentItem, type Tool, type ToolContext } from '@citadel/shared';
import type { PublishAdapter, SocialPlatform } from '@citadel/integrations/social';

const PublishInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  contentId: z.string().min(1),
  platform: z.enum(['facebook', 'instagram', 'google_business']),
});
type PublishInput = z.infer<typeof PublishInputSchema>;

/**
 * Publishes APPROVED content through the configured PublishAdapter (mock by
 * default — see integrations/social). Publishing is only reachable from
 * APPROVED status; the repository's lifecycle guard enforces this
 * independently of the adapter, so this tool can never mark content
 * published without a prior human approval. `clientIdOrSlug` is the
 * authorized client/context this publish is happening on behalf of —
 * resolved to a real client id and used to scope every lookup, so content
 * belonging to a different client can never be published through this
 * client's context (see database/src/repositories/content-repository.ts).
 */
export function createPublishContentTool(adapter: PublishAdapter): Tool<PublishInput, ContentItem> {
  return {
    name: 'publish_content',
    description: "Publish a client's APPROVED content item to an external channel. Requires prior approval.",
    inputSchema: PublishInputSchema,
    async execute(input, context: ToolContext) {
      const client = await clientRepository.requireByIdOrSlug(input.clientIdOrSlug);
      const existing = await contentRepository.requireByIdForClient(client.id, input.contentId);
      if (existing.status !== 'APPROVED') {
        // Fail fast on the lifecycle guard before calling the adapter, so a
        // not-yet-approved item never gets marked FAILED (that transition is
        // itself only valid from APPROVED) and the caller gets a direct,
        // unambiguous error instead of a masked secondary one.
        throw new InvalidLifecycleTransitionError(existing.status, 'PUBLISHED');
      }

      try {
        const result = await adapter.publish({
          platform: input.platform as SocialPlatform,
          body: existing.body,
          metadata: existing.metadata,
        });

        const item = await contentRepository.transition(client.id, input.contentId, 'PUBLISHED', {
          publishedAt: result.publishedAt,
          externalId: result.externalId,
          metadata: { ...existing.metadata, publish: { provider: result.provider, isMock: result.isMock } },
        });

        await auditRepository.record({
          clientId: item.clientId,
          actor: context.actor.label,
          action: 'publish_content',
          targetType: 'ContentItem',
          targetId: item.id,
          metadata: { provider: result.provider, isMock: result.isMock, externalId: result.externalId },
        });

        return item;
      } catch (error) {
        if ((error as { code?: string }).code === 'NOT_CONFIGURED') {
          // Not configured is a caller-facing configuration problem, not a
          // publish failure — don't move the lifecycle to FAILED for it.
          throw error;
        }
        const failed = await contentRepository.transition(client.id, input.contentId, 'FAILED', {
          metadata: { ...existing.metadata, publishError: String(error) },
        });
        await auditRepository.record({
          clientId: failed.clientId,
          actor: context.actor.label,
          action: 'publish_content_failed',
          targetType: 'ContentItem',
          targetId: failed.id,
          metadata: { error: String(error) },
        });
        throw error;
      }
    },
  };
}
