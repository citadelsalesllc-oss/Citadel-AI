import { z } from 'zod';
import type { Tool } from '@citadel/shared';

const WebSearchInputSchema = z.object({ query: z.string().min(1) });

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOutput {
  query: string;
  results: WebSearchResultItem[];
  provider: string;
  note?: string;
}

/**
 * Real web search is future work (no provider configured yet). Returns an
 * empty result set with an explicit note rather than fabricating search
 * results — agents must surface this note instead of pretending they
 * searched the web.
 */
export const webSearchTool: Tool<z.infer<typeof WebSearchInputSchema>, WebSearchOutput> = {
  name: 'web_search',
  description: 'Search the web for a query. Returns no results until a search provider is configured.',
  inputSchema: WebSearchInputSchema,
  async execute(input) {
    return {
      query: input.query,
      results: [],
      provider: 'none',
      note: 'No web search provider is configured. This is not a search failure — no external search was performed.',
    };
  },
};
