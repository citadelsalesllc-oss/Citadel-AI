import { z } from 'zod';
import { contentRepository, auditRepository } from '@citadel/database';
import { ContentTypeSchema, type ContentItem, type Tool, type ToolContext } from '@citadel/shared';

const ContentSaveInputSchema = z.object({
  clientId: z.string().min(1),
  type: ContentTypeSchema,
  body: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});
type ContentSaveInput = z.infer<typeof ContentSaveInputSchema>;

/** Persists generated content as a new DRAFT. Never marks content as published. */
export const contentSaveTool: Tool<ContentSaveInput, ContentItem> = {
  name: 'content_save',
  description: 'Save generated content as a new DRAFT content item for a client.',
  inputSchema: ContentSaveInputSchema,
  async execute(input, context: ToolContext) {
    const item = await contentRepository.create({
      clientId: input.clientId,
      type: input.type,
      body: input.body,
      metadata: input.metadata,
      createdBy: context.actor.label,
    });
    await auditRepository.record({
      clientId: input.clientId,
      actor: context.actor.label,
      action: 'content_save',
      targetType: 'ContentItem',
      targetId: item.id,
      metadata: { type: input.type, status: item.status },
    });
    return item;
  },
};

const ContentSearchInputSchema = z.object({
  clientId: z.string().min(1),
  status: z.string().optional(),
});
type ContentSearchInput = z.infer<typeof ContentSearchInputSchema>;

export const contentSearchTool: Tool<ContentSearchInput, ContentItem[]> = {
  name: 'content_search',
  description: "Search a client's previously saved content items, optionally filtered by status.",
  inputSchema: ContentSearchInputSchema,
  async execute(input) {
    const items = await contentRepository.listByClient(input.clientId);
    return input.status ? items.filter((item) => item.status === input.status) : items;
  },
};
