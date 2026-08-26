import type { TargetAudience, UpdateTargetAudienceInput } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toTargetAudience } from '../mappers.js';

export const targetAudienceRepository = {
  async getByClient(clientId: string): Promise<TargetAudience | null> {
    const row = await prisma.targetAudience.findUnique({ where: { clientId } });
    return row ? toTargetAudience(row) : null;
  },

  async upsert(clientId: string, input: UpdateTargetAudienceInput): Promise<TargetAudience> {
    const row = await prisma.targetAudience.upsert({
      where: { clientId },
      create: {
        clientId,
        primaryCustomer: input.primaryCustomer,
        secondaryCustomers: input.secondaryCustomers ?? [],
        customerProblems: input.customerProblems ?? [],
        buyingMotivations: input.buyingMotivations ?? [],
        objections: input.objections ?? [],
        geographicTargeting: input.geographicTargeting ?? [],
      },
      update: {
        primaryCustomer: input.primaryCustomer,
        secondaryCustomers: input.secondaryCustomers,
        customerProblems: input.customerProblems,
        buyingMotivations: input.buyingMotivations,
        objections: input.objections,
        geographicTargeting: input.geographicTargeting,
      },
    });
    return toTargetAudience(row);
  },
};
