import { z } from 'zod';
import { contentRepository, auditRepository } from '@citadel/database';
import { type ContentItem, type Tool, type ToolContext } from '@citadel/shared';

const ContentIdInputSchema = z.object({ contentId: z.string().min(1) });

/** Submits a DRAFT (or REVISION_REQUIRED) content item for human review. */
export const approvalRequestTool: Tool<z.infer<typeof ContentIdInputSchema>, ContentItem> = {
  name: 'approval_request',
  description: 'Submit a draft content item for human review before it can be approved or published.',
  inputSchema: ContentIdInputSchema,
  async execute(input, context: ToolContext) {
    const item = await contentRepository.transition(input.contentId, 'REVIEW');
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

const ApproveInputSchema = z.object({ contentId: z.string().min(1), reviewer: z.string().min(1) });

/** Human approval gate. Only APPROVED content may ever be published. */
export const contentApproveTool: Tool<z.infer<typeof ApproveInputSchema>, ContentItem> = {
  name: 'content_approve',
  description: 'Approve a content item that is in REVIEW. Required before publishing.',
  inputSchema: ApproveInputSchema,
  async execute(input, context: ToolContext) {
    const item = await contentRepository.transition(input.contentId, 'APPROVED', {
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
  contentId: z.string().min(1),
  reviewer: z.string().min(1),
  reason: z.string().min(1),
});

export const contentRejectTool: Tool<z.infer<typeof RejectInputSchema>, ContentItem> = {
  name: 'content_reject',
  description: 'Reject a content item that is in REVIEW, ending its lifecycle.',
  inputSchema: RejectInputSchema,
  async execute(input, context: ToolContext) {
    const item = await contentRepository.transition(input.contentId, 'REJECTED', {
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
  description: 'Send a content item that is in REVIEW back for revision, with feedback.',
  inputSchema: RejectInputSchema,
  async execute(input, context: ToolContext) {
    const item = await contentRepository.transition(input.contentId, 'REVISION_REQUIRED', {
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
