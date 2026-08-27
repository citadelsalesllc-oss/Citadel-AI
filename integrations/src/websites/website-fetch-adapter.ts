import {
  InvalidUrlError,
  UnsupportedContentTypeError,
  WebsiteContentTooLargeError,
  WebsiteFetchTimeoutError,
  WebsiteUnreachableError,
  type RobotsTxtInfo,
  type SitemapInfo,
  type WebsiteFetchResult,
  type WebsiteHeading,
  type WebsiteLink,
} from '@citadel/shared';

export type { WebsiteFetchResult, WebsiteHeading, WebsiteLink, RobotsTxtInfo, SitemapInfo };

const MAX_TEXT_EXCERPT = 5000;
const MAX_LINKS = 200;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
/** Fixed, short timeout for the two auxiliary root-resource fetches (robots.txt/sitemap.xml) — a slow/missing one must never make the whole audit hang. */
const AUX_FETCH_TIMEOUT_MS = 5_000;
/** Bounds memory/time on pathological or accidentally non-HTML responses. A real crawler would stream-cap this; for the MVP's single-URL-per-audit volume, checking the fully-read body length is simpler and sufficient — see the module doc comment. */
const MAX_BODY_BYTES = 5_000_000;
const HTML_CONTENT_TYPE_PATTERN = /^(text\/html|application\/xhtml\+xml)/i;

function parseTargetUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidUrlError(url, 'not a well-formed URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidUrlError(url, `unsupported protocol "${parsed.protocol}"`);
  }
  return parsed;
}

function extractTag(html: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html);
  return match?.[1]?.replace(/\s+/g, ' ').trim() || null;
}

function extractMetaContent(html: string, name: string): string | null {
  const match = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=(["'])(.*?)\\1`, 'i').exec(html);
  return match?.[2]?.trim() || null;
}

function extractCanonicalUrl(html: string): string | null {
  const match = /<link[^>]+rel=["']canonical["'][^>]+href=(["'])(.*?)\1/i.exec(html);
  return match?.[2]?.trim() || null;
}

function extractHeadings(html: string): WebsiteHeading[] {
  const headings: WebsiteHeading[] = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = m[2]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text) headings.push({ level: Number(m[1]), text });
  }
  return headings;
}

function extractLinks(html: string, base: URL): WebsiteLink[] {
  const links: WebsiteLink[] = [];
  const re = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && links.length < MAX_LINKS) {
    const rawHref = m[1]?.trim();
    if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) continue;
    let resolved: URL;
    try {
      resolved = new URL(rawHref, base);
    } catch {
      continue;
    }
    const text = m[2]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? '';
    links.push({ href: resolved.toString(), text, internal: resolved.host === base.host });
  }
  return links;
}

function countImagesMissingAlt(html: string): { count: number; missingAlt: number } {
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = imgTags.filter((tag) => !/\balt\s*=\s*["'][^"']*["']/i.test(tag) || /\balt\s*=\s*["']\s*["']/i.test(tag)).length;
  return { count: imgTags.length, missingAlt };
}

function extractVisibleText(html: string): { excerpt: string; wordCount: number } {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = text ? text.split(' ').length : 0;
  return { excerpt: text.slice(0, MAX_TEXT_EXCERPT), wordCount };
}

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': 'CitadelAI-SeoAudit/0.1 (+https://citadelsalesllc.example)', ...init.headers },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new WebsiteFetchTimeoutError(url, timeoutMs);
    }
    throw new WebsiteUnreachableError(url, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRobotsTxt(origin: string): Promise<RobotsTxtInfo> {
  try {
    const response = await fetchWithTimeout(`${origin}/robots.txt`, AUX_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      return { exists: false, blocksAll: false, content: null };
    }
    const content = (await response.text()).slice(0, MAX_TEXT_EXCERPT);
    const starBlock = /user-agent:\s*\*([\s\S]*?)(?:\nuser-agent:|$)/i.exec(content)?.[1] ?? '';
    const blocksAll = /disallow:\s*\/\s*$/im.test(starBlock);
    return { exists: true, blocksAll, content };
  } catch {
    // A missing/unreachable robots.txt is itself a valid (reportable) SEO
    // finding, not a fetch failure — never let it fail the whole audit.
    return { exists: false, blocksAll: false, content: null };
  }
}

async function fetchSitemap(origin: string): Promise<SitemapInfo> {
  const sitemapUrl = `${origin}/sitemap.xml`;
  try {
    const response = await fetchWithTimeout(sitemapUrl, AUX_FETCH_TIMEOUT_MS, { method: 'HEAD' });
    return response.ok ? { exists: true, url: sitemapUrl } : { exists: false, url: null };
  } catch {
    return { exists: false, url: null };
  }
}

/**
 * Fetches and parses a public webpage for the SEO/Website agents, plus its
 * origin's robots.txt and sitemap.xml (explicitly-required SEO signals for
 * the audit workflow, not organic crawling — see ARCHITECTURE.md "SEO
 * analysis pipeline" for why fetching these two specific, well-known paths
 * for a client's OWN site (which the client explicitly asked to have
 * audited) is not the "web crawler" the master spec says not to build).
 * Real, dependency-free implementation (built-in fetch, regex-based
 * extraction — no headless browser/HTML parser needed for MVP-level
 * audits). All fetched content is untrusted external input: callers must
 * not treat it as instructions and should not interpolate it unescaped
 * into further prompts.
 *
 * Never pretends data was retrieved on failure: a genuinely unreachable or
 * timed-out target throws (WebsiteUnreachableError /
 * WebsiteFetchTimeoutError), as does a non-HTML response
 * (UnsupportedContentTypeError) or one exceeding the size limit
 * (WebsiteContentTooLargeError). An HTTP error status from the target
 * (404, 500, ...) is NOT thrown — it's a real, analyzable SEO finding, so
 * it's returned in the result for the analysis engine to flag.
 */
export class WebsiteFetchAdapter {
  private readonly timeoutMs: number;

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  }

  async fetch(url: string): Promise<WebsiteFetchResult> {
    const target = parseTargetUrl(url);
    const response = await fetchWithTimeout(target.toString(), this.timeoutMs);

    const contentType = response.headers.get('content-type');
    if (contentType && !HTML_CONTENT_TYPE_PATTERN.test(contentType)) {
      throw new UnsupportedContentTypeError(target.toString(), contentType);
    }

    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_BODY_BYTES) {
      throw new WebsiteContentTooLargeError(target.toString(), MAX_BODY_BYTES);
    }

    const finalUrl = new URL(response.url || target.toString());
    const headings = extractHeadings(html);
    const { excerpt, wordCount } = extractVisibleText(html);
    const links = extractLinks(html, finalUrl);
    const { count: imageCount, missingAlt: imagesMissingAlt } = countImagesMissingAlt(html);

    const [robotsTxt, sitemap] = await Promise.all([
      fetchRobotsTxt(finalUrl.origin),
      fetchSitemap(finalUrl.origin),
    ]);

    return {
      requestedUrl: target.toString(),
      finalUrl: finalUrl.toString(),
      redirected: finalUrl.toString() !== target.toString(),
      statusCode: response.status,
      ok: response.ok,
      https: finalUrl.protocol === 'https:',
      contentType,
      title: extractTag(html, 'title'),
      metaDescription: extractMetaContent(html, 'description'),
      canonicalUrl: extractCanonicalUrl(html),
      metaRobots: extractMetaContent(html, 'robots'),
      headings,
      h1Count: headings.filter((h) => h.level === 1).length,
      h2Count: headings.filter((h) => h.level === 2).length,
      wordCount,
      textExcerpt: excerpt,
      links,
      internalLinkCount: links.filter((l) => l.internal).length,
      imageCount,
      imagesMissingAlt,
      robotsTxt,
      sitemap,
      fetchedAt: new Date(),
    };
  }
}
