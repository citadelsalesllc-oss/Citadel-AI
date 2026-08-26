import { z } from 'zod';
import { ContentTypeSchema } from '@citadel/shared';

export const ContentPlatformSchema = z.enum(['facebook', 'instagram', 'google_business', 'blog', 'website', 'email']);
export type ContentPlatform = z.infer<typeof ContentPlatformSchema>;

export const PLATFORM_TO_CONTENT_TYPE: Record<ContentPlatform, z.infer<typeof ContentTypeSchema>> = {
  facebook: 'SOCIAL_POST',
  instagram: 'INSTAGRAM_CAPTION',
  google_business: 'GOOGLE_BUSINESS_POST',
  blog: 'BLOG_POST',
  website: 'WEBSITE_COPY',
  email: 'EMAIL',
};

export const ContentAgentInputSchema = z.object({
  platform: ContentPlatformSchema,
  instruction: z.string().min(1),
});
export type ContentAgentInput = z.infer<typeof ContentAgentInputSchema>;

export interface ContentAgentOutput {
  body: string;
  contentType: z.infer<typeof ContentTypeSchema>;
  platform: ContentPlatform;
  modelUsed: string;
  providerUsed: string;
}
