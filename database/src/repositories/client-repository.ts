import { ClientNotFoundError, type ClientProfile, type CreateClientInput, type UpdateClientInput } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toClientProfile } from '../mappers.js';

function slugify(companyName: string): string {
  return companyName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const clientRepository = {
  async create(input: CreateClientInput): Promise<ClientProfile> {
    const slug = input.slug?.trim() || slugify(input.companyName);
    const row = await prisma.client.create({
      data: {
        slug,
        companyName: input.companyName,
        description: input.description,
        industry: input.industry,
        serviceArea: input.serviceArea ?? [],
        address: input.address,
        phone: input.phone,
        email: input.email,
        website: input.website,
        services: input.services ?? [],
        targetCustomers: input.targetCustomers ?? [],
        brandRules: input.brandRules ?? { forbiddenPhrases: [], preferredPhrases: [], styleNotes: [] },
        offers: input.offers ?? [],
        competitors: input.competitors ?? [],
        seoKeywords: input.seoKeywords ?? [],
        locations: input.locations ?? [],
        faqs: input.faqs ?? [],
        notes: input.notes ?? [],
      },
    });
    return toClientProfile(row);
  },

  async update(idOrSlug: string, input: UpdateClientInput): Promise<ClientProfile> {
    const existing = await this.findByIdOrSlug(idOrSlug);
    if (!existing) {
      throw new ClientNotFoundError(idOrSlug);
    }
    const row = await prisma.client.update({
      where: { id: existing.id },
      data: {
        companyName: input.companyName,
        description: input.description,
        industry: input.industry,
        serviceArea: input.serviceArea,
        address: input.address,
        phone: input.phone,
        email: input.email,
        website: input.website,
        services: input.services,
        targetCustomers: input.targetCustomers,
        brandRules: input.brandRules,
        offers: input.offers,
        competitors: input.competitors,
        seoKeywords: input.seoKeywords,
        locations: input.locations,
        faqs: input.faqs,
        notes: input.notes,
      },
    });
    return toClientProfile(row);
  },

  async findByIdOrSlug(idOrSlug: string): Promise<ClientProfile | null> {
    const row = await prisma.client.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    });
    return row ? toClientProfile(row) : null;
  },

  async requireByIdOrSlug(idOrSlug: string): Promise<ClientProfile> {
    const client = await this.findByIdOrSlug(idOrSlug);
    if (!client) {
      throw new ClientNotFoundError(idOrSlug);
    }
    return client;
  },

  async list(): Promise<ClientProfile[]> {
    const rows = await prisma.client.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toClientProfile);
  },
};
