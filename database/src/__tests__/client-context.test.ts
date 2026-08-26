import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { ClientNotFoundError } from '@citadel/shared';
import { clientRepository } from '../repositories/client-repository.js';
import { serviceRepository } from '../repositories/service-repository.js';
import { brandProfileRepository } from '../repositories/brand-profile-repository.js';
import { faqRepository } from '../repositories/faq-repository.js';
import { contentRepository } from '../repositories/content-repository.js';
import { getClientContext } from '../client-context.js';
import { prisma } from '../prisma.js';

describe('getClientContext', () => {
  const createdClientIds: string[] = [];

  afterAll(async () => {
    if (createdClientIds.length) {
      await prisma.client.deleteMany({ where: { id: { in: createdClientIds } } });
    }
  });

  it('returns a fully-populated context reflecting everything stored for the client', async () => {
    const client = await clientRepository.create({
      slug: `test-context-${randomUUID()}`,
      companyName: 'Context Test Co',
      phone: '(208) 555-0142',
    });
    createdClientIds.push(client.id);

    await serviceRepository.add(client.id, { serviceName: 'Septic Installation' });
    await brandProfileRepository.upsert(client.id, { brandVoice: 'Direct and honest.' });
    await faqRepository.add(client.id, { question: 'Q?', answer: 'A.' });
    await contentRepository.create({
      clientId: client.id,
      type: 'SOCIAL_POST',
      body: 'body',
      metadata: {},
      tags: [],
      createdBy: 'test',
    });

    const context = await getClientContext(client.id);

    expect(context.core.companyName).toBe('Context Test Co');
    expect(context.core.phone).toBe('(208) 555-0142');
    expect(context.services).toHaveLength(1);
    expect(context.services[0]?.serviceName).toBe('Septic Installation');
    expect(context.brandProfile?.brandVoice).toBe('Direct and honest.');
    expect(context.faqs).toHaveLength(1);
    expect(context.recentContent).toHaveLength(1);
    // Nothing was ever set for these — must be null/empty, never invented.
    expect(context.targetAudience).toBeNull();
    expect(context.seoProfile).toBeNull();
    expect(context.offers).toEqual([]);
    expect(context.marketingNotes).toEqual([]);
  });

  it('resolves by slug as well as id', async () => {
    const slug = `test-context-slug-${randomUUID()}`;
    const client = await clientRepository.create({ slug, companyName: 'Slug Test Co' });
    createdClientIds.push(client.id);

    const context = await getClientContext(slug);
    expect(context.core.id).toBe(client.id);
  });

  it('returns an empty-but-well-formed context for a client with no knowledge on file yet', async () => {
    const client = await clientRepository.create({
      slug: `test-context-empty-${randomUUID()}`,
      companyName: 'Brand New Client',
    });
    createdClientIds.push(client.id);

    const context = await getClientContext(client.id);

    expect(context.services).toEqual([]);
    expect(context.serviceAreas).toEqual([]);
    expect(context.brandProfile).toBeNull();
    expect(context.targetAudience).toBeNull();
    expect(context.seoProfile).toBeNull();
    expect(context.offers).toEqual([]);
    expect(context.faqs).toEqual([]);
    expect(context.marketingNotes).toEqual([]);
    expect(context.recentContent).toEqual([]);
  });

  it('throws ClientNotFoundError for an unknown client instead of returning an empty context', async () => {
    await expect(getClientContext('does-not-exist')).rejects.toThrow(ClientNotFoundError);
  });
});
