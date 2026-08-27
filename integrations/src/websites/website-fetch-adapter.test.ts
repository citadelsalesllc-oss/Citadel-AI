import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidUrlError,
  UnsupportedContentTypeError,
  WebsiteContentTooLargeError,
  WebsiteFetchTimeoutError,
  WebsiteUnreachableError,
} from '@citadel/shared';
import { WebsiteFetchAdapter } from './website-fetch-adapter.js';

const FULL_PAGE_HTML = `<!doctype html>
<html>
<head>
  <title>CDA Septic Systems | Septic Installation &amp; Pumping</title>
  <meta name="description" content="Local septic tank installation and pumping serving Coeur d'Alene, ID.">
  <link rel="canonical" href="https://example.com/">
  <meta name="robots" content="index, follow">
</head>
<body>
  <h1>Septic Tank Installation in Coeur d'Alene</h1>
  <h2>Our Services</h2>
  <p>We install and pump septic systems for local homeowners. Call now for a free quote.</p>
  <a href="/services">Services</a>
  <a href="https://other-site.example/partner">Partner</a>
  <a href="tel:+12085550142">Call (208) 555-0142</a>
  <a href="mailto:info@example.com?subject=Quote">Email Us</a>
  <img src="/truck.jpg" alt="Septic truck">
  <img src="/logo.png">
  <form action="/quote"><input name="name"></form>
</body>
</html>`;

function jsonHeaders(contentType = 'text/html; charset=utf-8'): Headers {
  return new Headers({ 'content-type': contentType });
}

/** Response.url is normally set by the fetch algorithm, not the constructor — override it on the instance so mocked redirects are observable. */
function withUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { value: url, configurable: true });
  return response;
}

function mockFetchImpl(handlers: {
  page?: (_url: string) => Response | Promise<Response>;
  robots?: Response | Promise<Response>;
  sitemap?: Response | Promise<Response>;
}) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/robots.txt')) {
      return handlers.robots ?? new Response('User-agent: *\nDisallow:\n', { status: 200, headers: jsonHeaders('text/plain') });
    }
    if (url.endsWith('/sitemap.xml')) {
      return handlers.sitemap ?? new Response('', { status: 404 });
    }
    if (handlers.page) return handlers.page(url);
    return new Response(FULL_PAGE_HTML, { status: 200, headers: jsonHeaders() });
  });
}

describe('WebsiteFetchAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects an invalid URL before attempting any fetch', async () => {
    const adapter = new WebsiteFetchAdapter();
    await expect(adapter.fetch('not a url')).rejects.toThrow(InvalidUrlError);
  });

  it('rejects a non-HTTP(S) URL', async () => {
    const adapter = new WebsiteFetchAdapter();
    await expect(adapter.fetch('ftp://example.com/file')).rejects.toThrow(InvalidUrlError);
  });

  it('extracts title, meta description, canonical, headings, links, and images from a full page', async () => {
    vi.stubGlobal('fetch', mockFetchImpl({}));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');

    expect(result.title).toContain('CDA Septic Systems');
    expect(result.metaDescription).toContain("Coeur d'Alene");
    expect(result.canonicalUrl).toBe('https://example.com/');
    expect(result.metaRobots).toBe('index, follow');
    expect(result.h1Count).toBe(1);
    expect(result.h2Count).toBe(1);
    expect(result.headings[0]).toEqual({ level: 1, text: "Septic Tank Installation in Coeur d'Alene" });
    expect(result.https).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.internalLinkCount).toBe(1);
    expect(result.links.some((l) => l.internal === false)).toBe(true);
    expect(result.imageCount).toBe(2);
    expect(result.imagesMissingAlt).toBe(1);
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('extracts tel:/mailto: links, form count, and phone-number-shaped text separately from the SEO link graph', async () => {
    vi.stubGlobal('fetch', mockFetchImpl({}));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');

    expect(result.telLinks).toEqual(['+12085550142']);
    expect(result.mailtoLinks).toEqual(['info@example.com']);
    expect(result.formCount).toBe(1);
    expect(result.phoneNumberMatches).toContain('2085550142');
    // tel:/mailto: are excluded from the navigable-link graph, not counted as internal/external links
    expect(result.links.some((l) => l.href.startsWith('tel:') || l.href.startsWith('mailto:'))).toBe(false);
  });

  it('reports zero forms and empty contact links when none are present', async () => {
    const html = '<html><body><h1>No contact info</h1><p>Nothing here.</p></body></html>';
    vi.stubGlobal('fetch', mockFetchImpl({ page: (_url) => new Response(html, { status: 200, headers: jsonHeaders() }) }));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');
    expect(result.formCount).toBe(0);
    expect(result.telLinks).toEqual([]);
    expect(result.mailtoLinks).toEqual([]);
    expect(result.phoneNumberMatches).toEqual([]);
  });

  it('reports robots.txt availability and a blanket-disallow rule', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchImpl({
        robots: new Response('User-agent: *\nDisallow: /\n', { status: 200, headers: jsonHeaders('text/plain') }),
      }),
    );
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');
    expect(result.robotsTxt.exists).toBe(true);
    expect(result.robotsTxt.blocksAll).toBe(true);
  });

  it('reports robots.txt as missing when the request 404s', async () => {
    vi.stubGlobal('fetch', mockFetchImpl({ robots: new Response('', { status: 404 }) }));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');
    expect(result.robotsTxt.exists).toBe(false);
  });

  it('reports sitemap.xml availability', async () => {
    vi.stubGlobal('fetch', mockFetchImpl({ sitemap: new Response('', { status: 200 }) }));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');
    expect(result.sitemap.exists).toBe(true);
    expect(result.sitemap.url).toBe('https://example.com/sitemap.xml');
  });

  it('reports sitemap.xml as missing when unavailable', async () => {
    vi.stubGlobal('fetch', mockFetchImpl({}));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');
    expect(result.sitemap.exists).toBe(false);
  });

  it('does not throw on an HTTP error status — returns it as data for the analysis engine', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchImpl({ page: (_url) => new Response('<html><body>Not found</body></html>', { status: 404, headers: jsonHeaders() }) }),
    );
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/missing');
    expect(result.statusCode).toBe(404);
    expect(result.ok).toBe(false);
  });

  it('records a redirect to a different final URL', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchImpl({
        page: () => withUrl(new Response(FULL_PAGE_HTML, { status: 200, headers: jsonHeaders() }), 'https://example.com/home'),
      }),
    );
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');
    expect(result.redirected).toBe(true);
    expect(result.finalUrl).toBe('https://example.com/home');
  });

  it('throws WebsiteUnreachableError on a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed: ENOTFOUND');
      }),
    );
    const adapter = new WebsiteFetchAdapter();
    await expect(adapter.fetch('https://does-not-resolve.invalid/')).rejects.toThrow(WebsiteUnreachableError);
  });

  it('throws WebsiteFetchTimeoutError when the fetch is aborted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    );
    const adapter = new WebsiteFetchAdapter({ timeoutMs: 50 });
    await expect(adapter.fetch('https://slow.example/')).rejects.toThrow(WebsiteFetchTimeoutError);
  });

  it('throws UnsupportedContentTypeError for a non-HTML response', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchImpl({ page: (_url) => new Response('%PDF-1.4', { status: 200, headers: jsonHeaders('application/pdf') }) }),
    );
    const adapter = new WebsiteFetchAdapter();
    await expect(adapter.fetch('https://example.com/brochure.pdf')).rejects.toThrow(UnsupportedContentTypeError);
  });

  it('throws WebsiteContentTooLargeError when the body exceeds the size limit', async () => {
    const hugeHtml = `<html><body>${'x'.repeat(6_000_000)}</body></html>`;
    vi.stubGlobal('fetch', mockFetchImpl({ page: (_url) => new Response(hugeHtml, { status: 200, headers: jsonHeaders() }) }));
    const adapter = new WebsiteFetchAdapter();
    await expect(adapter.fetch('https://example.com/huge')).rejects.toThrow(WebsiteContentTooLargeError);
  });

  it('flags a non-HTTPS URL', async () => {
    vi.stubGlobal('fetch', mockFetchImpl({ page: (_url) => new Response(FULL_PAGE_HTML, { status: 200, headers: jsonHeaders() }) }));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('http://example.com/');
    expect(result.https).toBe(false);
  });

  it('reports zero H1s when the page has none', async () => {
    const html = '<html><head><title>No H1</title></head><body><h2>Sub only</h2></body></html>';
    vi.stubGlobal('fetch', mockFetchImpl({ page: (_url) => new Response(html, { status: 200, headers: jsonHeaders() }) }));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');
    expect(result.h1Count).toBe(0);
  });

  it('reports multiple H1s', async () => {
    const html = '<html><body><h1>First</h1><h1>Second</h1></body></html>';
    vi.stubGlobal('fetch', mockFetchImpl({ page: (_url) => new Response(html, { status: 200, headers: jsonHeaders() }) }));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');
    expect(result.h1Count).toBe(2);
  });

  it('reports a missing title and meta description', async () => {
    const html = '<html><body><h1>Just a heading</h1></body></html>';
    vi.stubGlobal('fetch', mockFetchImpl({ page: (_url) => new Response(html, { status: 200, headers: jsonHeaders() }) }));
    const adapter = new WebsiteFetchAdapter();
    const result = await adapter.fetch('https://example.com/');
    expect(result.title).toBeNull();
    expect(result.metaDescription).toBeNull();
    expect(result.canonicalUrl).toBeNull();
  });
});
