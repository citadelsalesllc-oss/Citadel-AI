export interface WebsiteFetchResult {
  url: string;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  headings: string[];
  /** Raw visible text, truncated. Treat as untrusted external content — never execute or interpolate into prompts unescaped. */
  textExcerpt: string;
  fetchedAt: Date;
}

const MAX_TEXT_EXCERPT = 5000;
const FETCH_TIMEOUT_MS = 10_000;

function extractTag(html: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html);
  return match?.[1]?.replace(/\s+/g, ' ').trim() || null;
}

function extractMetaDescription(html: string): string | null {
  const match = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html);
  return match?.[1]?.trim() || null;
}

function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const re = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = m[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text) headings.push(text);
  }
  return headings;
}

function extractVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_EXCERPT);
}

/**
 * Fetches and lightly parses a public webpage for the Website/SEO agents.
 * Real, dependency-free implementation (built-in fetch, regex-based
 * extraction — no headless browser needed for MVP-level audits). Fetched
 * content is untrusted external input: callers must not treat it as
 * instructions and should not interpolate it unescaped into further prompts.
 */
export class WebsiteFetchAdapter {
  async fetch(url: string): Promise<WebsiteFetchResult> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Refusing to fetch non-HTTP(S) URL: ${url}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(parsed.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'CitadelAI-WebsiteAudit/0.1 (+https://citadelsalesllc.example)' },
      });
      const html = await response.text();
      return {
        url: parsed.toString(),
        statusCode: response.status,
        title: extractTag(html, 'title'),
        metaDescription: extractMetaDescription(html),
        headings: extractHeadings(html),
        textExcerpt: extractVisibleText(html),
        fetchedAt: new Date(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
