import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientNotFoundError, DuplicateRecordError } from '@citadel/shared';
import { clientRepository } from '../repositories/client-repository.js';
import { prisma } from '../prisma.js';

function uniqueSlug(): string {
  return `test-client-${randomUUID()}`;
}

describe('clientRepository', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length) {
      await prisma.client.deleteMany({ where: { id: { in: createdIds.splice(0) } } });
    }
  });

  it('creates a client with only the required fields', async () => {
    const slug = uniqueSlug();
    const client = await clientRepository.create({ slug, companyName: 'Acme Septic' });
    createdIds.push(client.id);

    expect(client.companyName).toBe('Acme Septic');
    expect(client.slug).toBe(slug);
    expect(client.status).toBe('PROSPECT');
    // Never a guessed value — absent fields are null, not invented.
    expect(client.phone).toBeNull();
    expect(client.address).toBeNull();
  });

  it('retrieves a client by id and by slug', async () => {
    const slug = uniqueSlug();
    const created = await clientRepository.create({ slug, companyName: 'Acme Septic' });
    createdIds.push(created.id);

    const byId = await clientRepository.findByIdOrSlug(created.id);
    const bySlug = await clientRepository.findByIdOrSlug(slug);

    expect(byId?.id).toBe(created.id);
    expect(bySlug?.id).toBe(created.id);
  });

  it('updates a client', async () => {
    const slug = uniqueSlug();
    const created = await clientRepository.create({ slug, companyName: 'Acme Septic' });
    createdIds.push(created.id);

    const updated = await clientRepository.update(created.id, { phone: '(208) 555-0142', city: "Coeur d'Alene" });

    expect(updated.phone).toBe('(208) 555-0142');
    expect(updated.city).toBe("Coeur d'Alene");
    expect(updated.companyName).toBe('Acme Septic');
  });

  it('lists clients including newly created ones', async () => {
    const slug = uniqueSlug();
    const created = await clientRepository.create({ slug, companyName: 'Acme Septic' });
    createdIds.push(created.id);

    const clients = await clientRepository.list();
    expect(clients.some((c) => c.id === created.id)).toBe(true);
  });

  it('rejects a duplicate slug', async () => {
    const slug = uniqueSlug();
    const created = await clientRepository.create({ slug, companyName: 'Acme Septic' });
    createdIds.push(created.id);

    await expect(clientRepository.create({ slug, companyName: 'A Different Company' })).rejects.toThrow(
      DuplicateRecordError,
    );
  });

  it('throws ClientNotFoundError for an invalid id', async () => {
    await expect(clientRepository.requireByIdOrSlug('does-not-exist')).rejects.toThrow(ClientNotFoundError);
  });

  it('returns null (not an error) from findByIdOrSlug for an invalid id', async () => {
    const result = await clientRepository.findByIdOrSlug('does-not-exist');
    expect(result).toBeNull();
  });

  it('throws ClientNotFoundError when updating a nonexistent client', async () => {
    await expect(clientRepository.update('does-not-exist', { companyName: 'X' })).rejects.toThrow(
      ClientNotFoundError,
    );
  });
});
