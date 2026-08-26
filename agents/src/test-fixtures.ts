import type { ClientProfile } from '@citadel/shared';

export function makeTestClient(overrides: Partial<ClientProfile> = {}): ClientProfile {
  return {
    id: 'client_test_1',
    slug: 'test-client',
    companyName: 'Test Client Co',
    description: 'A fictional business used only in tests.',
    industry: 'Testing',
    serviceArea: ["Coeur d'Alene, ID"],
    address: '123 Test St, Coeur d\'Alene, ID 83814',
    phone: '(208) 555-0142',
    email: 'test@example.com',
    website: 'https://example.com',
    services: [{ name: 'Widget Installation', description: 'We install widgets.' }],
    targetCustomers: ['Homeowners'],
    brandRules: {
      tone: 'Friendly and direct.',
      voiceDescription: 'Write like a helpful local expert.',
      forbiddenPhrases: ['best in the world', 'guaranteed for life'],
      preferredPhrases: ['locally owned and operated'],
      styleNotes: ['Keep it under 120 words.'],
    },
    offers: [{ name: 'Free Estimate', description: 'Free estimate on all new installs.' }],
    competitors: [],
    seoKeywords: ['widget installation'],
    locations: ["Coeur d'Alene"],
    faqs: [],
    notes: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
