import { ResourceNotFoundError, type CreateServiceInput, type Service, type UpdateServiceInput } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toService } from '../mappers.js';

/**
 * Every method here takes `clientId` explicitly and every lookup filters by
 * (id, clientId) together — this is the tenant-isolation enforcement point
 * for services. A service id that's valid but belongs to a different
 * client is indistinguishable from an id that doesn't exist at all (see
 * ResourceNotFoundError), so an agent or API caller can never probe for
 * another client's data by guessing ids.
 */
export const serviceRepository = {
  async add(clientId: string, input: CreateServiceInput): Promise<Service> {
    const row = await prisma.service.create({
      data: {
        clientId,
        serviceName: input.serviceName,
        description: input.description,
        priority: input.priority,
        active: input.active,
      },
    });
    return toService(row);
  },

  async update(clientId: string, serviceId: string, input: UpdateServiceInput): Promise<Service> {
    const existing = await prisma.service.findFirst({ where: { id: serviceId, clientId } });
    if (!existing) {
      throw new ResourceNotFoundError('Service', serviceId);
    }
    const row = await prisma.service.update({
      where: { id: serviceId },
      data: {
        serviceName: input.serviceName,
        description: input.description,
        priority: input.priority,
        active: input.active,
      },
    });
    return toService(row);
  },

  async listByClient(clientId: string): Promise<Service[]> {
    const rows = await prisma.service.findMany({
      where: { clientId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toService);
  },
};
