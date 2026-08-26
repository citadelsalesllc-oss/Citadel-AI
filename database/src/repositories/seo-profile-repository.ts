import type { SeoProfile, UpdateSeoProfileInput } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toSeoProfile } from '../mappers.js';

export const seoProfileRepository = {
  async getByClient(clientId: string): Promise<SeoProfile | null> {
    const row = await prisma.seoProfile.findUnique({ where: { clientId } });
    return row ? toSeoProfile(row) : null;
  },

  async upsert(clientId: string, input: UpdateSeoProfileInput): Promise<SeoProfile> {
    const row = await prisma.seoProfile.upsert({
      where: { clientId },
      create: {
        clientId,
        primaryKeywords: input.primaryKeywords ?? [],
        secondaryKeywords: input.secondaryKeywords ?? [],
        targetLocations: input.targetLocations ?? [],
        priorityServices: input.priorityServices ?? [],
        searchIntent: input.searchIntent,
        competitors: input.competitors ?? [],
        seoNotes: input.seoNotes,
      },
      update: {
        primaryKeywords: input.primaryKeywords,
        secondaryKeywords: input.secondaryKeywords,
        targetLocations: input.targetLocations,
        priorityServices: input.priorityServices,
        searchIntent: input.searchIntent,
        competitors: input.competitors,
        seoNotes: input.seoNotes,
      },
    });
    return toSeoProfile(row);
  },
};
