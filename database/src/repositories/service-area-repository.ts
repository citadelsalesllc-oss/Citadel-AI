import type { CreateServiceAreaInput, ServiceArea } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toServiceArea } from '../mappers.js';

export const serviceAreaRepository = {
  async add(clientId: string, input: CreateServiceAreaInput): Promise<ServiceArea> {
    const row = await prisma.serviceArea.create({
      data: {
        clientId,
        name: input.name,
        city: input.city,
        state: input.state,
        priority: input.priority,
        active: input.active,
      },
    });
    return toServiceArea(row);
  },

  async listByClient(clientId: string): Promise<ServiceArea[]> {
    const rows = await prisma.serviceArea.findMany({
      where: { clientId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toServiceArea);
  },
};
