import type { CreateMarketingNoteInput, MarketingNote } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toMarketingNote } from '../mappers.js';

export const marketingNoteRepository = {
  async add(clientId: string, input: CreateMarketingNoteInput): Promise<MarketingNote> {
    const row = await prisma.marketingNote.create({
      data: {
        clientId,
        note: input.note,
        category: input.category,
        priority: input.priority,
        source: input.source,
      },
    });
    return toMarketingNote(row);
  },

  async listByClient(clientId: string): Promise<MarketingNote[]> {
    const rows = await prisma.marketingNote.findMany({
      where: { clientId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toMarketingNote);
  },
};
