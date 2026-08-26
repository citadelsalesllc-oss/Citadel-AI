import { z } from 'zod';
import type { Tool } from '@citadel/shared';
import { WebsiteFetchAdapter, type WebsiteFetchResult } from '@citadel/integrations/websites';

const WebsiteFetchInputSchema = z.object({ url: z.string().url() });

export function createWebsiteFetchTool(adapter: WebsiteFetchAdapter = new WebsiteFetchAdapter()): Tool<
  z.infer<typeof WebsiteFetchInputSchema>,
  WebsiteFetchResult
> {
  return {
    name: 'website_fetch',
    description: 'Fetch a public webpage and extract its title, meta description, headings, and visible text.',
    inputSchema: WebsiteFetchInputSchema,
    async execute(input) {
      return adapter.fetch(input.url);
    },
  };
}

export interface WebsiteAnalysis {
  url: string;
  statusCode: number;
  title: { value: string | null; length: number; issues: string[] };
  metaDescription: { value: string | null; length: number; issues: string[] };
  headings: { count: number; issues: string[] };
}

function analyze(fetchResult: WebsiteFetchResult): WebsiteAnalysis {
  const titleIssues: string[] = [];
  if (!fetchResult.title) titleIssues.push('Missing <title> tag.');
  else if (fetchResult.title.length > 60) titleIssues.push('Title exceeds ~60 characters; may be truncated in search results.');

  const descIssues: string[] = [];
  if (!fetchResult.metaDescription) descIssues.push('Missing meta description.');
  else if (fetchResult.metaDescription.length > 160) descIssues.push('Meta description exceeds ~160 characters.');

  const headingIssues: string[] = [];
  if (fetchResult.headings.length === 0) headingIssues.push('No H1/H2 headings found.');

  return {
    url: fetchResult.url,
    statusCode: fetchResult.statusCode,
    title: { value: fetchResult.title, length: fetchResult.title?.length ?? 0, issues: titleIssues },
    metaDescription: {
      value: fetchResult.metaDescription,
      length: fetchResult.metaDescription?.length ?? 0,
      issues: descIssues,
    },
    headings: { count: fetchResult.headings.length, issues: headingIssues },
  };
}

export function createWebsiteAnalyzeTool(adapter: WebsiteFetchAdapter = new WebsiteFetchAdapter()): Tool<
  z.infer<typeof WebsiteFetchInputSchema>,
  WebsiteAnalysis
> {
  return {
    name: 'website_analyze',
    description: 'Fetch a webpage and run basic on-page SEO checks (title length, meta description, headings).',
    inputSchema: WebsiteFetchInputSchema,
    async execute(input) {
      const fetchResult = await adapter.fetch(input.url);
      return analyze(fetchResult);
    },
  };
}
