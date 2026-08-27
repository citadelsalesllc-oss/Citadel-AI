import type { ClientContext, WebsiteFetchResult } from '@citadel/shared';

export function makeTestClient(overrides: Partial<ClientContext> = {}): ClientContext {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    core: {
      id: 'client_test_1',
      slug: 'test-client',
      companyName: 'Test Client Co',
      legalName: null,
      industry: 'Testing',
      description: 'A fictional business used only in tests.',
      website: 'https://example.com',
      phone: '(208) 555-0142',
      email: 'test@example.com',
      address: null,
      city: "Coeur d'Alene",
      state: 'ID',
      zip: '83814',
      timezone: null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    services: [
      {
        id: 'service_test_1',
        clientId: 'client_test_1',
        serviceName: 'Widget Installation',
        description: 'We install widgets.',
        priority: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    serviceAreas: [
      {
        id: 'area_test_1',
        clientId: 'client_test_1',
        name: "Coeur d'Alene",
        city: "Coeur d'Alene",
        state: 'ID',
        priority: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    brandProfile: {
      id: 'brand_test_1',
      clientId: 'client_test_1',
      brandVoice: 'Write like a helpful local expert.',
      tone: 'Friendly and direct.',
      preferredPhrases: ['locally owned and operated'],
      forbiddenPhrases: ['best in the world', 'guaranteed for life'],
      writingStyle: null,
      emojiPolicy: null,
      capitalizationPreferences: null,
      ctaPreferences: null,
      otherRules: ['Keep it under 120 words.'],
      createdAt: now,
      updatedAt: now,
    },
    targetAudience: null,
    seoProfile: {
      id: 'seo_test_1',
      clientId: 'client_test_1',
      primaryKeywords: ['widget installation'],
      secondaryKeywords: [],
      targetLocations: [],
      priorityServices: [],
      searchIntent: null,
      competitors: [],
      seoNotes: null,
      createdAt: now,
      updatedAt: now,
    },
    offers: [
      {
        id: 'offer_test_1',
        clientId: 'client_test_1',
        offerName: 'Free Estimate',
        description: 'Free estimate on all new installs.',
        cta: null,
        restrictions: null,
        active: true,
        startDate: null,
        endDate: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    faqs: [],
    marketingNotes: [],
    recentContent: [],
    ...overrides,
  };
}

/**
 * A reasonably strong baseline page (clear CTA, visible phone, contact
 * form, trust signals) shared by the SEO and Website agents' test suites —
 * tests override toward specific negative cases (missing CTA, no phone,
 * etc.) rather than each file maintaining its own copy of a "good" page.
 */
export function makeTestPage(overrides: Partial<WebsiteFetchResult> = {}): WebsiteFetchResult {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    redirected: false,
    statusCode: 200,
    ok: true,
    https: true,
    contentType: 'text/html',
    title: "Widget Installation in Coeur d'Alene | Test Client Co",
    metaDescription: "Local widget installation serving Coeur d'Alene, ID. Call now for a free estimate.",
    canonicalUrl: 'https://example.com/',
    metaRobots: 'index, follow',
    headings: [
      { level: 1, text: "Widget Installation in Coeur d'Alene" },
      { level: 2, text: 'Our Services' },
      { level: 2, text: 'Frequently Asked Questions' },
    ],
    h1Count: 1,
    h2Count: 2,
    wordCount: 400,
    textExcerpt:
      "Test Client Co proudly offers widget installation serving Coeur d'Alene, ID. Call now for a free estimate. We are licensed and insured with 20 years of experience. Call (208) 555-0142 today. Read our 5 star reviews from happy customers. We offer financing and a satisfaction guarantee — no obligation quotes.",
    links: [
      { href: 'https://example.com/contact', text: 'Contact Us', internal: true },
      { href: 'https://example.com/quote', text: 'Get a Free Quote', internal: true },
    ],
    internalLinkCount: 2,
    imageCount: 1,
    imagesMissingAlt: 0,
    telLinks: ['2085550142'],
    mailtoLinks: ['info@example.com'],
    formCount: 1,
    phoneNumberMatches: ['2085550142'],
    robotsTxt: { exists: true, blocksAll: false, content: 'User-agent: *\nDisallow:\n' },
    sitemap: { exists: true, url: 'https://example.com/sitemap.xml' },
    fetchedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
