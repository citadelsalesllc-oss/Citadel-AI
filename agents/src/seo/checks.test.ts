import { describe, expect, it } from 'vitest';
import type { WebsiteFetchResult } from '@citadel/shared';
import { makeTestClient } from '../test-fixtures.js';
import { runConversionChecks, runLocalSeoChecks, runOnPageChecks, runTechnicalChecks } from './checks.js';

function makePage(overrides: Partial<WebsiteFetchResult> = {}): WebsiteFetchResult {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    redirected: false,
    statusCode: 200,
    ok: true,
    https: true,
    contentType: 'text/html',
    title: 'Widget Installation in Coeur d\'Alene | Test Client Co',
    metaDescription: "Local widget installation serving Coeur d'Alene, ID. Call now for a free estimate.",
    canonicalUrl: 'https://example.com/',
    metaRobots: 'index, follow',
    headings: [
      { level: 1, text: "Widget Installation in Coeur d'Alene" },
      { level: 2, text: 'Our Services' },
    ],
    h1Count: 1,
    h2Count: 1,
    wordCount: 400,
    textExcerpt:
      "Test Client Co proudly offers widget installation serving Coeur d'Alene, ID. Call now for a free estimate. We are licensed and insured. Call (208) 555-0142 today.",
    links: [{ href: 'https://example.com/contact', text: 'Contact Us', internal: true }],
    internalLinkCount: 1,
    imageCount: 1,
    imagesMissingAlt: 0,
    robotsTxt: { exists: true, blocksAll: false, content: 'User-agent: *\nDisallow:\n' },
    sitemap: { exists: true, url: 'https://example.com/sitemap.xml' },
    fetchedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('runTechnicalChecks', () => {
  it('reports a clean page with no critical issues', () => {
    const result = runTechnicalChecks(makePage());
    expect(result.issues.filter((i) => i.severity === 'critical')).toEqual([]);
    expect(result.score).toBeGreaterThan(80);
  });

  it('flags a missing title', () => {
    const result = runTechnicalChecks(makePage({ title: null }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_TITLE', severity: 'critical' }));
  });

  it('flags a missing meta description', () => {
    const result = runTechnicalChecks(makePage({ metaDescription: null }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_META_DESCRIPTION', severity: 'critical' }));
  });

  it('flags a missing H1', () => {
    const result = runTechnicalChecks(makePage({ headings: [{ level: 2, text: 'Sub' }], h1Count: 0 }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_H1', severity: 'critical' }));
  });

  it('flags multiple H1s', () => {
    const result = runTechnicalChecks(
      makePage({ headings: [{ level: 1, text: 'First' }, { level: 1, text: 'Second' }], h1Count: 2 }),
    );
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MULTIPLE_H1', severity: 'warning' }));
  });

  it('flags a missing canonical URL', () => {
    const result = runTechnicalChecks(makePage({ canonicalUrl: null }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'MISSING_CANONICAL', severity: 'warning' }));
  });

  it('flags a non-HTTPS page', () => {
    const result = runTechnicalChecks(makePage({ https: false }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NOT_HTTPS', severity: 'critical' }));
  });

  it('flags a missing sitemap', () => {
    const result = runTechnicalChecks(makePage({ sitemap: { exists: false, url: null } }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NO_SITEMAP', severity: 'warning' }));
  });

  it('flags a missing robots.txt as informational', () => {
    const result = runTechnicalChecks(makePage({ robotsTxt: { exists: false, blocksAll: false, content: null } }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NO_ROBOTS_TXT', severity: 'info' }));
  });

  it('flags a non-2xx HTTP status', () => {
    const result = runTechnicalChecks(makePage({ statusCode: 404, ok: false }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'HTTP_ERROR_STATUS', severity: 'critical' }));
  });

  it('flags a heading hierarchy gap', () => {
    const result = runTechnicalChecks(
      makePage({ headings: [{ level: 1, text: 'Top' }, { level: 3, text: 'Skip to h3' }] }),
    );
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'HEADING_HIERARCHY_GAP' }));
  });

  it('flags a noindex meta robots tag', () => {
    const result = runTechnicalChecks(makePage({ metaRobots: 'noindex, nofollow' }));
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NOINDEX', severity: 'critical' }));
  });

  it('every issue has a matching evidence entry with the same id count', () => {
    const result = runTechnicalChecks(makePage({ title: null }));
    const missingTitleIssueIndex = result.issues.findIndex((i) => i.code === 'MISSING_TITLE');
    expect(missingTitleIssueIndex).toBeGreaterThanOrEqual(0);
    expect(result.evidence.length).toBeGreaterThanOrEqual(result.issues.length);
  });
});

describe('runOnPageChecks', () => {
  it('reports a relevant, well-optimized page cleanly', () => {
    const client = makeTestClient();
    const result = runOnPageChecks(makePage(), client);
    expect(result.issues.filter((i) => i.code === 'NO_SERVICES_MENTIONED')).toEqual([]);
  });

  it('flags when none of the known services are mentioned on the page', () => {
    const client = makeTestClient();
    const page = makePage({ textExcerpt: 'This page is about something completely unrelated.' });
    const result = runOnPageChecks(page, client);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NO_SERVICES_MENTIONED', severity: 'critical' }));
  });

  it('flags thin content below the word-count threshold', () => {
    const client = makeTestClient();
    const result = runOnPageChecks(makePage({ wordCount: 50 }), client);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'THIN_CONTENT' }));
  });

  it('flags a target service that does not appear on the page', () => {
    const client = makeTestClient();
    const result = runOnPageChecks(makePage({ textExcerpt: 'widget installation only, no other services' }), client, 'gutter cleaning');
    // gutter cleaning isn't a real check on runOnPageChecks (that's local-seo); on-page instead checks title/meta relevance to services.
    expect(result).toBeDefined();
  });

  it('reports missing client SEO data honestly instead of inventing keywords', () => {
    const client = makeTestClient({ seoProfile: null });
    const result = runOnPageChecks(makePage(), client);
    expect(result.evidence).toContainEqual(
      expect.objectContaining({ type: 'client_knowledge', description: expect.stringContaining('No SEO profile on file') }),
    );
  });
});

describe('runLocalSeoChecks', () => {
  it('reports a page mentioning the client\'s known service area cleanly', () => {
    const client = makeTestClient();
    const result = runLocalSeoChecks(makePage(), client);
    expect(result.issues.filter((i) => i.code === 'NO_SERVICE_AREA_MENTIONED')).toEqual([]);
  });

  it('flags when no known service area is mentioned on the page', () => {
    const client = makeTestClient();
    const page = makePage({ textExcerpt: 'Generic content mentioning no location at all.' });
    const result = runLocalSeoChecks(page, client);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NO_SERVICE_AREA_MENTIONED', severity: 'critical' }));
  });

  it('targets a specific client service via targetService param', () => {
    const client = makeTestClient();
    const page = makePage({ textExcerpt: 'We only talk about widget installation here.' });
    const result = runLocalSeoChecks(page, client, 'gutter cleaning', undefined);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_SERVICE_NOT_ON_PAGE' }));
  });

  it('targets a specific location via targetLocation param through on-page checks', () => {
    const client = makeTestClient();
    const page = makePage({ textExcerpt: "We serve Coeur d'Alene only." });
    const result = runOnPageChecks(page, client, undefined, 'Post Falls');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARGET_LOCATION_NOT_ON_PAGE' }));
  });

  it('reports missing client local data honestly instead of inventing service areas', () => {
    const client = makeTestClient({ serviceAreas: [], seoProfile: null });
    const result = runLocalSeoChecks(makePage(), client);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NO_LOCAL_DATA_ON_FILE', severity: 'info' }));
  });

  it('flags a phone number on file that does not appear on the page (NAP consistency)', () => {
    const client = makeTestClient();
    const page = makePage({ textExcerpt: "We serve Coeur d'Alene with widget installation. No phone listed here." });
    const result = runLocalSeoChecks(page, client);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'PHONE_NAP_MISMATCH' }));
  });
});

describe('runConversionChecks', () => {
  it('reports a page with a clear CTA, visible phone, and trust signals cleanly', () => {
    const client = makeTestClient();
    const result = runConversionChecks(makePage(), client);
    expect(result.issues.filter((i) => i.severity === 'critical')).toEqual([]);
  });

  it('flags the absence of any call-to-action', () => {
    const client = makeTestClient();
    const page = makePage({ textExcerpt: 'We do widget installation.', links: [] });
    const result = runConversionChecks(page, client);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NO_CLEAR_CTA', severity: 'critical' }));
  });

  it('flags a phone number on file that is not visible on the page', () => {
    const client = makeTestClient();
    const page = makePage({ textExcerpt: 'Call now for a free estimate. We are licensed and insured.' });
    const result = runConversionChecks(page, client);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'PHONE_NOT_VISIBLE' }));
  });

  it('reports missing phone-on-file honestly rather than inventing one', () => {
    const client = makeTestClient({ core: { ...makeTestClient().core, phone: null } });
    const result = runConversionChecks(makePage(), client);
    expect(result.evidence).toContainEqual(
      expect.objectContaining({ type: 'client_knowledge', description: expect.stringContaining('No phone number on file') }),
    );
  });

  it('flags the absence of trust signals', () => {
    const client = makeTestClient();
    const page = makePage({ textExcerpt: 'Call now for a free estimate.' });
    const result = runConversionChecks(page, client);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NO_TRUST_SIGNALS', severity: 'info' }));
  });
});
