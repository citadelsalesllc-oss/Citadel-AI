import type { CreateOfferInput, Offer } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toOffer } from '../mappers.js';

export const offerRepository = {
  async add(clientId: string, input: CreateOfferInput): Promise<Offer> {
    const row = await prisma.offer.create({
      data: {
        clientId,
        offerName: input.offerName,
        description: input.description,
        cta: input.cta,
        restrictions: input.restrictions,
        active: input.active,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      },
    });
    return toOffer(row);
  },

  async listByClient(clientId: string): Promise<Offer[]> {
    const rows = await prisma.offer.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
    return rows.map(toOffer);
  },
};
