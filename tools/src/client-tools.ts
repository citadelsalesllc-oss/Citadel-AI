import { z } from 'zod';
import { clientRepository, auditRepository } from '@citadel/database';
import { UpdateClientInputSchema, type ClientProfile, type Tool, type ToolContext } from '@citadel/shared';

const ClientLookupInputSchema = z.object({
  idOrSlug: z.string().min(1),
});
type ClientLookupInput = z.infer<typeof ClientLookupInputSchema>;

/**
 * The only sanctioned way agents obtain client facts. Agents must call this
 * (directly or via the orchestrator loading context up front) rather than
 * guessing — never invent phone numbers, services, or addresses.
 */
export const clientLookupTool: Tool<ClientLookupInput, ClientProfile> = {
  name: 'client_lookup',
  description: "Look up a client's full profile (facts, brand rules, services, etc.) by id or slug.",
  inputSchema: ClientLookupInputSchema,
  async execute(input) {
    return clientRepository.requireByIdOrSlug(input.idOrSlug);
  },
};

const ClientUpdateInputSchema = z.object({
  idOrSlug: z.string().min(1),
  updates: UpdateClientInputSchema,
});
type ClientUpdateInput = z.infer<typeof ClientUpdateInputSchema>;

export const clientUpdateTool: Tool<ClientUpdateInput, ClientProfile> = {
  name: 'client_update',
  description: "Update fields on a client's stored profile. Every call is audit logged.",
  inputSchema: ClientUpdateInputSchema,
  async execute(input, context: ToolContext) {
    const updated = await clientRepository.update(input.idOrSlug, input.updates);
    await auditRepository.record({
      clientId: updated.id,
      actor: context.actor.label,
      action: 'client_update',
      targetType: 'Client',
      targetId: updated.id,
      metadata: { updatedFields: Object.keys(input.updates) },
    });
    return updated;
  },
};
