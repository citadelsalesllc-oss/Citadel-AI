import { z } from 'zod';
import { clientRepository, auditRepository, getClientContext } from '@citadel/database';
import {
  UpdateClientInputSchema,
  type ClientContext,
  type ClientRecord,
  type Tool,
  type ToolContext,
} from '@citadel/shared';

const ClientLookupInputSchema = z.object({
  idOrSlug: z.string().min(1),
});
type ClientLookupInput = z.infer<typeof ClientLookupInputSchema>;

/** Looks up the core client record only (id, name, contact fields, status) — no services/brand/SEO. */
export const clientLookupTool: Tool<ClientLookupInput, ClientRecord> = {
  name: 'client_lookup',
  description: "Look up a client's core record (company name, contact details, status) by id or slug.",
  inputSchema: ClientLookupInputSchema,
  async execute(input) {
    return clientRepository.requireByIdOrSlug(input.idOrSlug);
  },
};

/**
 * The only sanctioned way agents obtain full client knowledge — services,
 * brand voice, SEO profile, offers, FAQs, marketing notes, recent content
 * — in one call, with no knowledge of the underlying tables required.
 * Agents must call this rather than guessing; see MissingInformationError
 * for what to do when a needed fact isn't in the result.
 */
export const clientContextTool: Tool<ClientLookupInput, ClientContext> = {
  name: 'client_context',
  description: "Retrieve a client's complete marketing context (services, brand profile, SEO profile, offers, FAQs, marketing notes, recent content) for use by an AI agent.",
  inputSchema: ClientLookupInputSchema,
  async execute(input) {
    return getClientContext(input.idOrSlug);
  },
};

const ClientUpdateInputSchema = z.object({
  idOrSlug: z.string().min(1),
  updates: UpdateClientInputSchema,
});
type ClientUpdateInput = z.infer<typeof ClientUpdateInputSchema>;

export const clientUpdateTool: Tool<ClientUpdateInput, ClientRecord> = {
  name: 'client_update',
  description: "Update fields on a client's core record. Every call is audit logged.",
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
