import type { CreateFaqInput, Faq } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toFaq } from '../mappers.js';

export const faqRepository = {
  async add(clientId: string, input: CreateFaqInput): Promise<Faq> {
    const row = await prisma.faq.create({
      data: {
        clientId,
        question: input.question,
        answer: input.answer,
        category: input.category,
        active: input.active,
      },
    });
    return toFaq(row);
  },

  async listByClient(clientId: string): Promise<Faq[]> {
    const rows = await prisma.faq.findMany({ where: { clientId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toFaq);
  },
};
