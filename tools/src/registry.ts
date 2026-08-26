import { ToolRegistry } from '@citadel/shared';
import type { PublishAdapter } from '@citadel/integrations/social';
import { createPublishAdapterFromEnv } from '@citadel/integrations/social';
import { WebsiteFetchAdapter } from '@citadel/integrations/websites';
import { clientLookupTool, clientUpdateTool } from './client-tools.js';
import { contentSaveTool, contentSearchTool } from './content-tools.js';
import {
  approvalRequestTool,
  contentApproveTool,
  contentRejectTool,
  contentRequestRevisionTool,
} from './approval-tools.js';
import { createPublishContentTool } from './publish-tools.js';
import { reviewLookupTool, analyticsLookupTool } from './stub-data-tools.js';
import { webSearchTool } from './web-search-tool.js';
import { createWebsiteFetchTool, createWebsiteAnalyzeTool } from './website-tools.js';

export interface ToolRegistryOptions {
  publishAdapter?: PublishAdapter;
  websiteFetchAdapter?: WebsiteFetchAdapter;
}

export function createToolRegistry(options: ToolRegistryOptions = {}): ToolRegistry {
  const registry = new ToolRegistry();
  const websiteFetchAdapter = options.websiteFetchAdapter ?? new WebsiteFetchAdapter();
  const publishAdapter = options.publishAdapter ?? createPublishAdapterFromEnv();

  registry.register(clientLookupTool);
  registry.register(clientUpdateTool);
  registry.register(contentSaveTool);
  registry.register(contentSearchTool);
  registry.register(approvalRequestTool);
  registry.register(contentApproveTool);
  registry.register(contentRejectTool);
  registry.register(contentRequestRevisionTool);
  registry.register(createPublishContentTool(publishAdapter));
  registry.register(reviewLookupTool);
  registry.register(analyticsLookupTool);
  registry.register(webSearchTool);
  registry.register(createWebsiteFetchTool(websiteFetchAdapter));
  registry.register(createWebsiteAnalyzeTool(websiteFetchAdapter));

  return registry;
}
