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

/**
 * Phase 3 narrows actual generation to Facebook — the only platform with a
 * defined structured-output contract, prompt, and QA rules (see
 * prompts/src/content/v1.ts). The other ContentPlatform values stay in the
 * enum so the Orchestrator's keyword router (agents/src/orchestrator/router.ts)
 * keeps classifying requests the same way it always has; ContentAgent just
 * reports NotImplementedError for anything but Facebook rather than
 * generating an unreviewed, unspecified shape for it. Extending to another
 * platform is additive: give it its own prompt module + entry in this set,
 * nothing about the Orchestrator or the API contract needs to change.
 */
export const SUPPORTED_GENERATION_PLATFORMS: ReadonlySet<ContentPlatform> = new Set(['facebook']);

export const ContentAgentInputSchema = z.object({
  platform: ContentPlatformSchema,
  topic: z.string().min(1),
  userInstructions: z.string().optional(),
  /** Prior content bodies for this client, newest first — injected by the caller (see create-social-post skill), never fetched by the agent itself. */
  previousContent: z.array(z.string()).default([]),
});
export type ContentAgentInput = z.infer<typeof ContentAgentInputSchema>;

export interface ContentAgentOutput {
  platform: ContentPlatform;
  contentType: z.infer<typeof ContentTypeSchema>;
  content: string;
  hashtags: string[];
  cta: string | null;
  seoKeywordsUsed: string[];
  notes: string[];
  modelUsed: string;
  providerUsed: string;
  /** Present when the provider reported it (e.g. Anthropic); absent for providers that don't (e.g. the mock). */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
