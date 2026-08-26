import { z } from 'zod';

export const ContentTypeSchema = z.enum([
  'SOCIAL_POST',
  'INSTAGRAM_CAPTION',
  'GOOGLE_BUSINESS_POST',
  'BLOG_POST',
  'WEBSITE_COPY',
  'EMAIL',
  'REVIEW_RESPONSE',
  'CONTENT_CALENDAR',
  'OTHER',
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

/**
 * Content lifecycle. External publishing (PUBLISHED) is only reachable from
 * APPROVED — see database ContentItem state machine enforcement in
 * tools/approval and tools/publish.
 */
export const ContentStatusSchema = z.enum([
  'DRAFT',
  'REVIEW',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'REVISION_REQUIRED',
  'FAILED',
]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export const ContentItemSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  type: ContentTypeSchema,
  status: ContentStatusSchema,
  // Distinct from `type`: type is the kind of content, platform is where
  // it's headed (facebook/instagram/google_business/...), null for
  // platform-agnostic content.
  platform: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  body: z.string(),
  campaign: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  createdBy: z.string(),
  reviewer: z.string().nullable().default(null),
  approvedAt: z.string().or(z.date()).nullable().default(null),
  publishedAt: z.string().or(z.date()).nullable().default(null),
  externalId: z.string().nullable().default(null),
  rejectionReason: z.string().nullable().default(null),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type ContentItem = z.infer<typeof ContentItemSchema>;

export const CreateContentItemInputSchema = z.object({
  clientId: z.string(),
  type: ContentTypeSchema,
  platform: z.string().optional(),
  title: z.string().optional(),
  body: z.string().min(1),
  campaign: z.string().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  createdBy: z.string().min(1),
});
export type CreateContentItemInput = z.infer<typeof CreateContentItemInputSchema>;
