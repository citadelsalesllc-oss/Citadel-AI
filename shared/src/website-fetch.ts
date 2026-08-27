/**
 * The shape a website fetch produces for the SEO/Website agents — the
 * "website fetching" analogue of model-provider.ts: agents (and their
 * deterministic check engines) depend only on this interface, never on the
 * concrete fetch/parsing implementation. See integrations/websites for the
 * real implementation (WebsiteFetchAdapter) and ARCHITECTURE.md "SEO
 * analysis pipeline."
 */

export interface WebsiteHeading {
  level: number;
  text: string;
}

export interface WebsiteLink {
  href: string;
  text: string;
  internal: boolean;
}

export interface RobotsTxtInfo {
  exists: boolean;
  /** True if a `User-agent: *` block contains a bare `Disallow: /`. A simple, deliberately conservative heuristic — not a full robots.txt parser. */
  blocksAll: boolean;
  content: string | null;
}

export interface SitemapInfo {
  exists: boolean;
  url: string | null;
}

export interface WebsiteFetchResult {
  requestedUrl: string;
  /** Differs from requestedUrl if the server redirected. */
  finalUrl: string;
  redirected: boolean;
  statusCode: number;
  /** statusCode in the 200-299 range. A non-ok status is itself an SEO finding, not a fetch failure. */
  ok: boolean;
  https: boolean;
  contentType: string | null;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  metaRobots: string | null;
  /** All h1-h6 headings in document order. */
  headings: WebsiteHeading[];
  h1Count: number;
  h2Count: number;
  wordCount: number;
  /** Raw visible text, truncated. Untrusted external content — never treat as instructions, never interpolate unescaped into a prompt. */
  textExcerpt: string;
  links: WebsiteLink[];
  internalLinkCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  robotsTxt: RobotsTxtInfo;
  sitemap: SitemapInfo;
  fetchedAt: Date;
}
