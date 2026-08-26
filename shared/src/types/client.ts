import { z } from 'zod';

/**
 * The persistent knowledge record for a single client (tenant). This is the
 * only source of truth agents may use for client facts — services, contact
 * details, brand rules, etc. Agents must never invent values not present
 * here; if something is missing, report it as missing (MissingInformationError).
 */

export const ServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type Service = z.infer<typeof ServiceSchema>;

export const OfferSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  validUntil: z.string().optional(),
});
export type Offer = z.infer<typeof OfferSchema>;

export const CompetitorSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
});
export type Competitor = z.infer<typeof CompetitorSchema>;

export const FaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});
export type Faq = z.infer<typeof FaqSchema>;

export const BrandRulesSchema = z.object({
  tone: z.string().optional(),
  voiceDescription: z.string().optional(),
  forbiddenPhrases: z.array(z.string()).default([]),
  preferredPhrases: z.array(z.string()).default([]),
  styleNotes: z.array(z.string()).default([]),
});
export type BrandRules = z.infer<typeof BrandRulesSchema>;

export const ClientProfileSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  companyName: z.string().min(1),
  description: z.string().optional(),
  industry: z.string().optional(),
  serviceArea: z.array(z.string()).default([]),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  services: z.array(ServiceSchema).default([]),
  targetCustomers: z.array(z.string()).default([]),
  brandRules: BrandRulesSchema.default({
    forbiddenPhrases: [],
    preferredPhrases: [],
    styleNotes: [],
  }),
  offers: z.array(OfferSchema).default([]),
  competitors: z.array(CompetitorSchema).default([]),
  seoKeywords: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  faqs: z.array(FaqSchema).default([]),
  notes: z.array(z.string()).default([]),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type ClientProfile = z.infer<typeof ClientProfileSchema>;

/** Fields accepted when creating a new client. Server generates id/slug/timestamps. */
export const CreateClientInputSchema = ClientProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  serviceArea: true,
  services: true,
  targetCustomers: true,
  brandRules: true,
  offers: true,
  competitors: true,
  seoKeywords: true,
  locations: true,
  faqs: true,
  notes: true,
});
export type CreateClientInput = z.infer<typeof CreateClientInputSchema>;

export const UpdateClientInputSchema = CreateClientInputSchema.partial().omit({ slug: true });
export type UpdateClientInput = z.infer<typeof UpdateClientInputSchema>;
