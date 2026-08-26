import { Prisma } from '@prisma/client';
import {
  ClientNotFoundError,
  DuplicateRecordError,
  type ClientRecord,
  type CreateClientInput,
  type UpdateClientInput,
} from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toClientRecord } from '../mappers.js';

function slugify(companyName: string): string {
  return companyName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export const clientRepository = {
  async create(input: CreateClientInput): Promise<ClientRecord> {
    const slug = input.slug?.trim() || slugify(input.companyName);
    try {
      const row = await prisma.client.create({
        data: {
          slug,
          companyName: input.companyName,
          legalName: input.legalName,
          industry: input.industry,
          description: input.description,
          website: input.website,
          phone: input.phone,
          email: input.email,
          address: input.address,
          city: input.city,
          state: input.state,
          zip: input.zip,
          timezone: input.timezone,
          status: input.status,
        },
      });
      return toClientRecord(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateRecordError('Client', 'slug', slug);
      }
      throw error;
    }
  },

  async update(idOrSlug: string, input: UpdateClientInput): Promise<ClientRecord> {
    const existing = await this.findByIdOrSlug(idOrSlug);
    if (!existing) {
      throw new ClientNotFoundError(idOrSlug);
    }
    const row = await prisma.client.update({
      where: { id: existing.id },
      data: {
        companyName: input.companyName,
        legalName: input.legalName,
        industry: input.industry,
        description: input.description,
        website: input.website,
        phone: input.phone,
        email: input.email,
        address: input.address,
        city: input.city,
        state: input.state,
        zip: input.zip,
        timezone: input.timezone,
        status: input.status,
      },
    });
    return toClientRecord(row);
  },

  async findByIdOrSlug(idOrSlug: string): Promise<ClientRecord | null> {
    const row = await prisma.client.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    });
    return row ? toClientRecord(row) : null;
  },

  async requireByIdOrSlug(idOrSlug: string): Promise<ClientRecord> {
    const client = await this.findByIdOrSlug(idOrSlug);
    if (!client) {
      throw new ClientNotFoundError(idOrSlug);
    }
    return client;
  },

  async list(): Promise<ClientRecord[]> {
    const rows = await prisma.client.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toClientRecord);
  },
};
