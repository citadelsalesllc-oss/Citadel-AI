import { z } from 'zod';
import { NotConfiguredError, type Tool } from '@citadel/shared';

const ClientScopedInputSchema = z.object({ clientId: z.string().min(1) });

/**
 * No review-platform integration exists yet (Google/Yelp/Facebook reviews —
 * future work). Rather than inventing reviews, this tool explicitly reports
 * that no review data source is configured, so the Review Agent (also a
 * stub today) has an honest signal to surface to the user.
 */
export const reviewLookupTool: Tool<z.infer<typeof ClientScopedInputSchema>, never> = {
  name: 'review_lookup',
  description: "Look up a client's customer reviews. Requires a configured review-platform integration.",
  inputSchema: ClientScopedInputSchema,
  async execute() {
    throw new NotConfiguredError('Review platform integration');
  },
};

/**
 * No analytics/reporting integration exists yet (GA4, ad platforms —
 * future work). Explicitly reports the gap instead of fabricating metrics.
 */
export const analyticsLookupTool: Tool<z.infer<typeof ClientScopedInputSchema>, never> = {
  name: 'analytics_lookup',
  description: "Look up a client's marketing analytics. Requires a configured analytics integration.",
  inputSchema: ClientScopedInputSchema,
  async execute() {
    throw new NotConfiguredError('Analytics integration');
  },
};
