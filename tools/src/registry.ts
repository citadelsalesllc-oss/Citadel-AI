import { ToolRegistry } from '@citadel/shared';
import type { PublishAdapter } from '@citadel/integrations/social';
import { createPublishAdapterFromEnv } from '@citadel/integrations/social';
import { WebsiteFetchAdapter } from '@citadel/integrations/websites';
import type { ReviewProvider } from '@citadel/integrations/reviews';
import { createReviewProviderFromEnv } from '@citadel/integrations/reviews';
import { clientLookupTool, clientContextTool, clientUpdateTool } from './client-tools.js';
import { contentSaveTool, contentSearchTool } from './content-tools.js';
import {
  approvalRequestTool,
  contentApproveTool,
  contentRejectTool,
  contentRequestRevisionTool,
} from './approval-tools.js';
import { createPublishContentTool } from './publish-tools.js';
import { analyticsLookupTool } from './stub-data-tools.js';
import { webSearchTool } from './web-search-tool.js';
import { createWebsiteFetchTool, createWebsiteAnalyzeTool } from './website-tools.js';
import { seoAuditSaveTool, seoAuditHistoryTool } from './seo-tools.js';
import {
  createReviewSyncTool,
  reviewLookupTool,
  reviewGetTool,
  reviewResponseSaveTool,
  reviewApproveTool,
  reviewRejectTool,
  reviewRequestRevisionTool,
} from './review-tools.js';

export interface ToolRegistryOptions {
  publishAdapter?: PublishAdapter;
  websiteFetchAdapter?: WebsiteFetchAdapter;
  reviewProvider?: ReviewProvider;
}

export function createToolRegistry(options: ToolRegistryOptions = {}): ToolRegistry {
  const registry = new ToolRegistry();
  const websiteFetchAdapter = options.websiteFetchAdapter ?? new WebsiteFetchAdapter();
  const publishAdapter = options.publishAdapter ?? createPublishAdapterFromEnv();
  const reviewProvider = options.reviewProvider ?? createReviewProviderFromEnv();

  registry.register(clientLookupTool);
  registry.register(clientContextTool);
  registry.register(clientUpdateTool);
  registry.register(contentSaveTool);
  registry.register(contentSearchTool);
  registry.register(approvalRequestTool);
  registry.register(contentApproveTool);
  registry.register(contentRejectTool);
  registry.register(contentRequestRevisionTool);
  registry.register(createPublishContentTool(publishAdapter));
  registry.register(analyticsLookupTool);
  registry.register(webSearchTool);
  registry.register(createWebsiteFetchTool(websiteFetchAdapter));
  registry.register(createWebsiteAnalyzeTool(websiteFetchAdapter));
  registry.register(seoAuditSaveTool);
  registry.register(seoAuditHistoryTool);
  registry.register(createReviewSyncTool(reviewProvider));
  registry.register(reviewLookupTool);
  registry.register(reviewGetTool);
  registry.register(reviewResponseSaveTool);
  registry.register(reviewApproveTool);
  registry.register(reviewRejectTool);
  registry.register(reviewRequestRevisionTool);

  return registry;
}
