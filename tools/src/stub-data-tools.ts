import { z } from 'zod';
import { NotConfiguredError, type Tool } from '@citadel/shared';

const ClientScopedInputSchema = z.object({ clientId: z.string().min(1) });

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
