import { describe, expect, it } from 'vitest';
import { makeTestClient, makeTestPage } from '../test-fixtures.js';
import {
  buildMobileDisclosure,
  runBrandChecks,
  runContentChecks,
  runConversionChecks,
  runCustomerJourneyChecks,
  runFirstImpressionChecks,
} from './checks.js';

describe('Website Agent deterministic checks', () => {
  describe('runFirstImpressionChecks', () => {
    it('finds strengths on a strong baseline page', () => {
      const outcome = runFirstImpressionChecks(makeTestPage(), makeTestClient());
      expect(outcome.strengths.length).toBeGreaterThan(0);
      expect(outcome.score).toBeGreaterThan(50);
    });

    it('flags a page with no title and no H1', () => {
      const page = makeTestPage({ title: null, h1Count: 0, headings: [] });
      const outcome = runFirstImpressionChecks(page, makeTestClient());
      expect(outcome.issues.some((i) => i.includes('no title and no main heading'))).toBe(true);
    });

    it('flags missing location clarity when no known service area appears on the page', () => {
      const page = makeTestPage({
        title: 'Widget Installation | Test Client Co',
        headings: [{ level: 1, text: 'Widget Installation' }],
        textExcerpt: 'We do great widget installation work. Call us.',
      });
      const outcome = runFirstImpressionChecks(page, makeTestClient());
      expect(outcome.issues.some((i) => i.toLowerCase().includes('service area'))).toBe(true);
    });

    it('notes rather than penalizes when the client has no service areas on file', () => {
      const client = makeTestClient({ serviceAreas: [] });
      const outcome = runFirstImpressionChecks(makeTestPage(), client);
      // No location-related issue should be raised when there's nothing on file to check against
      expect(outcome.issues.some((i) => i.toLowerCase().includes('service area') || i.toLowerCase().includes('location'))).toBe(false);
    });
  });

  describe('runConversionChecks', () => {
    it('reuses the SEO agent conversion findings and reports strengths on a strong page', () => {
      const outcome = runConversionChecks(makeTestPage(), makeTestClient());
      expect(outcome.strengths.some((s) => s.toLowerCase().includes('call-to-action'))).toBe(true);
      expect(outcome.score).toBeGreaterThan(50);
    });

    it('flags a missing CTA', () => {
      const page = makeTestPage({ textExcerpt: 'We do plumbing work in the area.', links: [] });
      const outcome = runConversionChecks(page, makeTestClient());
      expect(outcome.issues.some((i) => i.toLowerCase().includes('call-to-action'))).toBe(true);
    });

    it('flags a missing phone number', () => {
      const page = makeTestPage({ textExcerpt: 'Call now for a free estimate.', telLinks: [], phoneNumberMatches: [] });
      const outcome = runConversionChecks(page, makeTestClient());
      expect(outcome.issues.some((i) => i.toLowerCase().includes('phone'))).toBe(true);
    });

    it('flags a missing contact path', () => {
      const page = makeTestPage({
        textExcerpt: 'Call now for a free estimate. We are licensed and insured.',
        links: [],
        formCount: 0,
      });
      const outcome = runConversionChecks(page, makeTestClient());
      expect(outcome.issues.some((i) => i.toLowerCase().includes('contact'))).toBe(true);
    });

    it('flags a missing quote/contact form separately from the SEO contact-path check', () => {
      const page = makeTestPage({ formCount: 0 });
      const outcome = runConversionChecks(page, makeTestClient());
      expect(outcome.issues.some((i) => i.toLowerCase().includes('quote/contact request form'))).toBe(true);
    });

    it('flags missing trust signals', () => {
      const page = makeTestPage({
        textExcerpt: 'We offer widget installation. Call now for a free estimate. Get a quote today.',
      });
      const outcome = runConversionChecks(page, makeTestClient());
      expect(outcome.issues.some((i) => i.toLowerCase().includes('trust signal'))).toBe(true);
    });

    it('rewards click-to-call when a tel: link is present', () => {
      const outcome = runConversionChecks(makeTestPage({ telLinks: ['2085550142'] }), makeTestClient());
      expect(outcome.strengths.some((s) => s.toLowerCase().includes('click-to-call'))).toBe(true);
    });

    it('flags a missing click-to-call link when the client has a phone on file but the page has no tel: link', () => {
      const page = makeTestPage({ telLinks: [] });
      const outcome = runConversionChecks(page, makeTestClient());
      expect(outcome.issues.some((i) => i.toLowerCase().includes('tel:'))).toBe(true);
    });

    it('only reports a guarantee/certification/financing when actually present, never as a missing-signal issue', () => {
      const page = makeTestPage({ textExcerpt: 'Widget installation serving the area. Call (208) 555-0142. Get a quote.' });
      const outcome = runConversionChecks(page, makeTestClient());
      expect(outcome.strengths.some((s) => s.toLowerCase().includes('guarantee'))).toBe(false);
      expect(outcome.issues.some((i) => i.toLowerCase().includes('guarantee'))).toBe(false);
    });
  });

  describe('runCustomerJourneyChecks', () => {
    it('produces friction points when first impression and contact clarity are weak', () => {
      const page = makeTestPage({ title: null, h1Count: 0, headings: [], formCount: 0, telLinks: [] });
      const client = makeTestClient();
      const firstImpression = runFirstImpressionChecks(page, client);
      const conversion = runConversionChecks(page, client);
      const outcome = runCustomerJourneyChecks(page, client, firstImpression, conversion);
      expect(outcome.frictionPoints.length).toBeGreaterThan(0);
      expect(outcome.frictionPoints.some((f) => f.toLowerCase().includes('contact'))).toBe(true);
    });

    it('reports strengths on a strong page with a clear contact path', () => {
      const page = makeTestPage();
      const client = makeTestClient();
      const firstImpression = runFirstImpressionChecks(page, client);
      const conversion = runConversionChecks(page, client);
      const outcome = runCustomerJourneyChecks(page, client, firstImpression, conversion);
      expect(outcome.strengths.length).toBeGreaterThan(0);
    });

    it('flags FAQs on file but not presented on the page', () => {
      const page = makeTestPage({ headings: [{ level: 1, text: 'Widget Installation' }] });
      const client = makeTestClient({
        faqs: [{ id: 'faq_1', clientId: 'client_test_1', question: 'Do you offer financing?', answer: 'Yes.', category: null, active: true, createdAt: new Date(), updatedAt: new Date() }],
      });
      const firstImpression = runFirstImpressionChecks(page, client);
      const conversion = runConversionChecks(page, client);
      const outcome = runCustomerJourneyChecks(page, client, firstImpression, conversion);
      expect(outcome.frictionPoints.some((f) => f.toLowerCase().includes('faq'))).toBe(true);
    });
  });

  describe('runContentChecks', () => {
    it('flags missing service information', () => {
      const page = makeTestPage({ textExcerpt: 'Welcome to our website. Call us today.' });
      const client = makeTestClient();
      const conversion = runConversionChecks(page, client);
      const outcome = runContentChecks(page, client, conversion);
      expect(outcome.issues.some((i) => i.toLowerCase().includes('services'))).toBe(true);
    });

    it('flags thin content below the word-count threshold', () => {
      const page = makeTestPage({ wordCount: 50 });
      const client = makeTestClient();
      const conversion = runConversionChecks(page, client);
      const outcome = runContentChecks(page, client, conversion);
      expect(outcome.issues.some((i) => i.toLowerCase().includes('thin') || i.includes('50 words'))).toBe(true);
    });

    it('rewards benefit-oriented language when present', () => {
      const page = makeTestPage({ textExcerpt: `${makeTestPage().textExcerpt} so you can rest easy knowing the job is done right.` });
      const client = makeTestClient();
      const conversion = runConversionChecks(page, client);
      const outcome = runContentChecks(page, client, conversion);
      expect(outcome.strengths.some((s) => s.toLowerCase().includes('benefit'))).toBe(true);
    });

    it('flags a repeated sentence', () => {
      const repeated = 'We are the best widget installers in the entire region and beyond.';
      const page = makeTestPage({ textExcerpt: `${repeated} ${repeated}` });
      const client = makeTestClient();
      const conversion = runConversionChecks(page, client);
      const outcome = runContentChecks(page, client, conversion);
      expect(outcome.issues.some((i) => i.toLowerCase().includes('more than once'))).toBe(true);
    });
  });

  describe('runBrandChecks', () => {
    it('flags a forbidden phrase from the client brand profile', () => {
      const page = makeTestPage({ textExcerpt: `${makeTestPage().textExcerpt} We are the best in the world at what we do.` });
      const client = makeTestClient(); // brandProfile.forbiddenPhrases includes 'best in the world'
      const outcome = runBrandChecks(page, client);
      expect(outcome.issues.some((i) => i.includes('best in the world'))).toBe(true);
    });

    it('reports no evaluable issues when no brand profile is on file', () => {
      const client = makeTestClient({ brandProfile: null });
      const outcome = runBrandChecks(makeTestPage(), client);
      expect(outcome.issues).toEqual([]);
      expect(outcome.score).toBe(100);
    });

    it('flags a missing company name in the title/headline', () => {
      const page = makeTestPage({ title: 'Home', headings: [{ level: 1, text: 'Welcome' }] });
      const outcome = runBrandChecks(page, makeTestClient());
      expect(outcome.issues.some((i) => i.toLowerCase().includes('company name'))).toBe(true);
    });
  });

  describe('buildMobileDisclosure', () => {
    it('always reports mobile testing as not performed, never fabricating a score', () => {
      const disclosure = buildMobileDisclosure();
      expect(disclosure.tested).toBe(false);
      expect(disclosure.note.toLowerCase()).toContain('not performed');
    });
  });

  describe('deterministic evidence traceability', () => {
    it('every issue and strength has a corresponding evidence catalog entry', () => {
      const page = makeTestPage();
      const client = makeTestClient();
      const outcome = runFirstImpressionChecks(page, client);
      expect(outcome.evidence.length).toBeGreaterThanOrEqual(outcome.strengths.length + outcome.issues.length);
      const ids = new Set(outcome.evidence.map((e) => e.id));
      expect(ids.size).toBe(outcome.evidence.length); // every evidence id is unique
    });
  });
});
