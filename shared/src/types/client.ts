import { z } from 'zod';

/**
 * The Phase 2 client knowledge system. A lean core `Client` record plus
 * normalized child tables (Service, ServiceArea, Offer, Faq,
 * MarketingNote) and one-to-one "profile" tables (BrandProfile,
 * TargetAudience, SeoProfile). Agents never see these individually — they
 * receive the aggregated `ClientContext` (bottom of this file) via the
 * `client_context` tool / `getClientContext()` service, so they never need
 * to know the underlying schema. See ARCHITECTURE.md "Client memory
 * system" for the normalization rationale.
 *
 * Every schema here is deliberately conservative: nothing defaults to an
 * invented value. A field with no data on file is `null`/empty, never a
 * plausible-sounding guess — see rules 15-17 of the master build spec.
 */

export const ClientStatusSchema = z.enum(['PROSPECT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']);
export type ClientStatus = z.infer<typeof ClientStatusSchema>;

// ---------------------------------------------------------------------------
// Client (core record)
// ---------------------------------------------------------------------------

export const ClientRecordSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  companyName: z.string().min(1),
  legalName: z.string().nullable().default(null),
  industry: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  state: z.string().nullable().default(null),
  zip: z.string().nullable().default(null),
  timezone: z.string().nullable().default(null),
  status: ClientStatusSchema.default('PROSPECT'),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type ClientRecord = z.infer<typeof ClientRecordSchema>;

export const CreateClientInputSchema = z.object({
  slug: z.string().min(1).optional(),
  companyName: z.string().min(1),
  legalName: z.string().optional(),
  industry: z.string().optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  timezone: z.string().optional(),
  status: ClientStatusSchema.optional(),
});
export type CreateClientInput = z.infer<typeof CreateClientInputSchema>;

export const UpdateClientInputSchema = CreateClientInputSchema.omit({ slug: true }).partial();
export type UpdateClientInput = z.infer<typeof UpdateClientInputSchema>;

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export const ServiceSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  serviceName: z.string().min(1),
  description: z.string().nullable().default(null),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Service = z.infer<typeof ServiceSchema>;

export const CreateServiceInputSchema = z.object({
  serviceName: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});
export type CreateServiceInput = z.infer<typeof CreateServiceInputSchema>;

export const UpdateServiceInputSchema = CreateServiceInputSchema.partial();
export type UpdateServiceInput = z.infer<typeof UpdateServiceInputSchema>;

// ---------------------------------------------------------------------------
// Service areas
// ---------------------------------------------------------------------------

export const ServiceAreaSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string().min(1),
  city: z.string().nullable().default(null),
  state: z.string().nullable().default(null),
  priority: z.number().int().default(0),
  active: z.boolean().default(true),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type ServiceArea = z.infer<typeof ServiceAreaSchema>;

export const CreateServiceAreaInputSchema = z.object({
  name: z.string().min(1),
  city: z.string().optional(),
  state: z.string().optional(),
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});
export type CreateServiceAreaInput = z.infer<typeof CreateServiceAreaInputSchema>;

// ---------------------------------------------------------------------------
// Brand profile (1:1)
// ---------------------------------------------------------------------------

export const BrandProfileSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  brandVoice: z.string().nullable().default(null),
  tone: z.string().nullable().default(null),
  preferredPhrases: z.array(z.string()).default([]),
  forbiddenPhrases: z.array(z.string()).default([]),
  writingStyle: z.string().nullable().default(null),
  emojiPolicy: z.string().nullable().default(null),
  capitalizationPreferences: z.string().nullable().default(null),
  ctaPreferences: z.string().nullable().default(null),
  otherRules: z.array(z.string()).default([]),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export const UpdateBrandProfileInputSchema = z.object({
  brandVoice: z.string().optional(),
  tone: z.string().optional(),
  preferredPhrases: z.array(z.string()).optional(),
  forbiddenPhrases: z.array(z.string()).optional(),
  writingStyle: z.string().optional(),
  emojiPolicy: z.string().optional(),
  capitalizationPreferences: z.string().optional(),
  ctaPreferences: z.string().optional(),
  otherRules: z.array(z.string()).optional(),
});
export type UpdateBrandProfileInput = z.infer<typeof UpdateBrandProfileInputSchema>;

// ---------------------------------------------------------------------------
// Target audience (1:1)
// ---------------------------------------------------------------------------

export const TargetAudienceSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  primaryCustomer: z.string().nullable().default(null),
  secondaryCustomers: z.array(z.string()).default([]),
  customerProblems: z.array(z.string()).default([]),
  buyingMotivations: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  geographicTargeting: z.array(z.string()).default([]),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type TargetAudience = z.infer<typeof TargetAudienceSchema>;

export const UpdateTargetAudienceInputSchema = z.object({
  primaryCustomer: z.string().optional(),
  secondaryCustomers: z.array(z.string()).optional(),
  customerProblems: z.array(z.string()).optional(),
  buyingMotivations: z.array(z.string()).optional(),
  objections: z.array(z.string()).optional(),
  geographicTargeting: z.array(z.string()).optional(),
});
export type UpdateTargetAudienceInput = z.infer<typeof UpdateTargetAudienceInputSchema>;

// ---------------------------------------------------------------------------
// SEO profile (1:1)
// ---------------------------------------------------------------------------

export const SeoProfileSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  primaryKeywords: z.array(z.string()).default([]),
  secondaryKeywords: z.array(z.string()).default([]),
  targetLocations: z.array(z.string()).default([]),
  priorityServices: z.array(z.string()).default([]),
  searchIntent: z.string().nullable().default(null),
  competitors: z.array(z.string()).default([]),
  seoNotes: z.string().nullable().default(null),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type SeoProfile = z.infer<typeof SeoProfileSchema>;

export const UpdateSeoProfileInputSchema = z.object({
  primaryKeywords: z.array(z.string()).optional(),
  secondaryKeywords: z.array(z.string()).optional(),
  targetLocations: z.array(z.string()).optional(),
  priorityServices: z.array(z.string()).optional(),
  searchIntent: z.string().optional(),
  competitors: z.array(z.string()).optional(),
  seoNotes: z.string().optional(),
});
export type UpdateSeoProfileInput = z.infer<typeof UpdateSeoProfileInputSchema>;

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export const OfferSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  offerName: z.string().min(1),
  description: z.string().nullable().default(null),
  cta: z.string().nullable().default(null),
  restrictions: z.string().nullable().default(null),
  active: z.boolean().default(true),
  startDate: z.string().or(z.date()).nullable().default(null),
  endDate: z.string().or(z.date()).nullable().default(null),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Offer = z.infer<typeof OfferSchema>;

export const CreateOfferInputSchema = z.object({
  offerName: z.string().min(1),
  description: z.string().optional(),
  cta: z.string().optional(),
  restrictions: z.string().optional(),
  active: z.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type CreateOfferInput = z.infer<typeof CreateOfferInputSchema>;

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export const FaqSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().nullable().default(null),
  active: z.boolean().default(true),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type Faq = z.infer<typeof FaqSchema>;

export const CreateFaqInputSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  category: z.string().optional(),
  active: z.boolean().optional(),
});
export type CreateFaqInput = z.infer<typeof CreateFaqInputSchema>;

// ---------------------------------------------------------------------------
// Marketing notes
// ---------------------------------------------------------------------------

export const MarketingNoteSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  note: z.string().min(1),
  category: z.string().nullable().default(null),
  priority: z.number().int().default(0),
  source: z.string().nullable().default(null),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type MarketingNote = z.infer<typeof MarketingNoteSchema>;

export const CreateMarketingNoteInputSchema = z.object({
  note: z.string().min(1),
  category: z.string().optional(),
  priority: z.number().int().optional(),
  source: z.string().optional(),
});
export type CreateMarketingNoteInput = z.infer<typeof CreateMarketingNoteInputSchema>;

// ---------------------------------------------------------------------------
// Client context — the aggregate handed to agents
// ---------------------------------------------------------------------------

/**
 * A trimmed summary of a past content item, included in ClientContext so
 * agents can avoid repeating themselves without pulling full post bodies
 * for every generation.
 */
export const ContentItemSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  platform: z.string().nullable(),
  title: z.string().nullable(),
  status: z.string(),
  createdAt: z.string().or(z.date()),
});
export type ContentItemSummary = z.infer<typeof ContentItemSummarySchema>;

/**
 * Everything a Citadel AI agent may need to know about one client, in one
 * call, with no knowledge of the underlying tables required. This is the
 * return type of `getClientContext()` (database/src/client-context.ts) and
 * the `client_context` tool — the single sanctioned way agents obtain
 * client facts. `null`/`[]` means "not on file," never "unknown, so
 * guess" — see MissingInformationError.
 */
export const ClientContextSchema = z.object({
  // Named `core` (not `client`) so consumers write `context.client.core.x`
  // instead of the confusing `context.client.client.x` — `context.client`
  // is already "the ClientContext for this request."
  core: ClientRecordSchema,
  services: z.array(ServiceSchema),
  serviceAreas: z.array(ServiceAreaSchema),
  brandProfile: BrandProfileSchema.nullable(),
  targetAudience: TargetAudienceSchema.nullable(),
  seoProfile: SeoProfileSchema.nullable(),
  offers: z.array(OfferSchema),
  faqs: z.array(FaqSchema),
  marketingNotes: z.array(MarketingNoteSchema),
  recentContent: z.array(ContentItemSummarySchema),
});
export type ClientContext = z.infer<typeof ClientContextSchema>;
