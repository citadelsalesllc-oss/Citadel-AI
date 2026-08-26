import { z } from 'zod';
import { clientRepository, contentRepository, auditRepository } from '@citadel/database';
import { type ContentItem, type Tool, type ToolContext } from '@citadel/shared';

/**
 * Every content-lifecycle tool below requires `clientIdOrSlug` — the
 * "authorized client/context" this action is being performed on behalf
 * of — and resolves it to a real client id BEFORE touching the content
 * item. contentRepository.transition() then scopes its lookup by
 * (contentId, clientId) together, so a contentId that's valid but
 * belongs to a different client fails with the same ResourceNotFoundError
 * as an unknown id — it can never be approved, rejected, or modified
 * through another client's context. See database/src/repositories/
 * content-repository.ts and database/src/__tests__/tenant-isolation.test.ts.
 */
const ContentIdInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  contentId: z.string().min(1),
});

/** Submits a DRAFT (or REVISION_REQUIRED) content item for human review. */
export const approvalRequestTool: Tool<z.infer<typeof ContentIdInputSchema>, ContentItem> = {
  name: 'approval_request',
  description: "Submit a client's draft content item for human review before it can be approved or published.",
  inputSchema: ContentIdInputSchema,
  async execute(input, context: ToolContext) {
    const client = await clientRepository.requireByIdOrSlug(input.clientIdOrSlug);
    const item = await contentRepository.transition(client.id, input.contentId, 'REVIEW');
    await auditRepository.record({
      clientId: item.clientId,
      actor: context.actor.label,
      action: 'approval_request',
      targetType: 'ContentItem',
      targetId: item.id,
      metadata: {},
    });
    return item;
  },
};

const ApproveInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  contentId: z.string().min(1),
  reviewer: z.string().min(1),
});

/** Human approval gate. Only APPROVED content may ever be published. */
export const contentApproveTool: Tool<z.infer<typeof ApproveInputSchema>, ContentItem> = {
  name: 'content_approve',
  description: "Approve a client's content item that is in REVIEW. Required before publishing.",
  inputSchema: ApproveInputSchema,
  async execute(input, context: ToolContext) {
    const client = await clientRepository.requireByIdOrSlug(input.clientIdOrSlug);
    const item = await contentRepository.transition(client.id, input.contentId, 'APPROVED', {
      reviewer: input.reviewer,
      approvedAt: new Date(),
    });
    await auditRepository.record({
      clientId: item.clientId,
      actor: context.actor.label,
      action: 'content_approve',
      targetType: 'ContentItem',
      targetId: item.id,
      metadata: { reviewer: input.reviewer },
    });
    return item;
  },
};

const RejectInputSchema = z.object({
  clientIdOrSlug: z.string().min(1),
  contentId: z.string().min(1),
  reviewer: z.string().min(1),
  reason: z.string().min(1),
});

export const contentRejectTool: Tool<z.infer<typeof RejectInputSchema>, ContentItem> = {
  name: 'content_reject',
  description: "Reject a client's content item that is in REVIEW, ending its lifecycle.",
  inputSchema: RejectInputSchema,
  async execute(input, context: ToolContext) {
    const client = await clientRepository.requireByIdOrSlug(input.clientIdOrSlug);
    const item = await contentRepository.transition(client.id, input.contentId, 'REJECTED', {
      reviewer: input.reviewer,
      rejectionReason: input.reason,
    });
    await auditRepository.record({
      clientId: item.clientId,
      actor: context.actor.label,
      action: 'content_reject',
      targetType: 'ContentItem',
      targetId: item.id,
      metadata: { reviewer: input.reviewer, reason: input.reason },
    });
    return item;
  },
};

export const contentRequestRevisionTool: Tool<z.infer<typeof RejectInputSchema>, ContentItem> = {
  name: 'content_request_revision',
  description: "Send a client's content item that is in REVIEW back for revision, with feedback.",
  inputSchema: RejectInputSchema,
  async execute(input, context: ToolContext) {
    const client = await clientRepository.requireByIdOrSlug(input.clientIdOrSlug);
    const item = await contentRepository.transition(client.id, input.contentId, 'REVISION_REQUIRED', {
      reviewer: input.reviewer,
      rejectionReason: input.reason,
    });
    await auditRepository.record({
      clientId: item.clientId,
      actor: context.actor.label,
      action: 'content_request_revision',
      targetType: 'ContentItem',
      targetId: item.id,
      metadata: { reviewer: input.reviewer, reason: input.reason },
    });
    return item;
  },
};
