import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ResourceNotFoundError } from '@citadel/shared';
import { clientRepository } from '../repositories/client-repository.js';
import { serviceRepository } from '../repositories/service-repository.js';
import { serviceAreaRepository } from '../repositories/service-area-repository.js';
import { brandProfileRepository } from '../repositories/brand-profile-repository.js';
import { targetAudienceRepository } from '../repositories/target-audience-repository.js';
import { seoProfileRepository } from '../repositories/seo-profile-repository.js';
import { offerRepository } from '../repositories/offer-repository.js';
import { faqRepository } from '../repositories/faq-repository.js';
import { marketingNoteRepository } from '../repositories/marketing-note-repository.js';
import { contentRepository } from '../repositories/content-repository.js';
import { prisma } from '../prisma.js';

describe('knowledge repositories', () => {
  let clientId: string;

  beforeAll(async () => {
    const client = await clientRepository.create({
      slug: `test-knowledge-${randomUUID()}`,
      companyName: 'Knowledge Test Co',
    });
    clientId = client.id;
  });

  afterAll(async () => {
    await prisma.client.delete({ where: { id: clientId } });
  });

  it('adds and updates a service', async () => {
    const service = await serviceRepository.add(clientId, {
      serviceName: 'Septic Installation',
      description: 'New system installs.',
    });
    expect(service.active).toBe(true);
    expect(service.priority).toBe(0);

    const updated = await serviceRepository.update(clientId, service.id, { priority: 5, active: false });
    expect(updated.priority).toBe(5);
    expect(updated.active).toBe(false);

    const list = await serviceRepository.listByClient(clientId);
    expect(list.some((s) => s.id === service.id)).toBe(true);
  });

  it('throws ResourceNotFoundError updating a service that does not exist', async () => {
    await expect(serviceRepository.update(clientId, 'does-not-exist', { priority: 1 })).rejects.toThrow(
      ResourceNotFoundError,
    );
  });

  it('adds a service area', async () => {
    const area = await serviceAreaRepository.add(clientId, { name: "Coeur d'Alene", city: "Coeur d'Alene", state: 'ID' });
    expect(area.name).toBe("Coeur d'Alene");

    const list = await serviceAreaRepository.listByClient(clientId);
    expect(list.some((a) => a.id === area.id)).toBe(true);
  });

  it('upserts the brand profile', async () => {
    expect(await brandProfileRepository.getByClient(clientId)).toBeNull();

    const created = await brandProfileRepository.upsert(clientId, {
      brandVoice: 'Straightforward and trustworthy.',
      forbiddenPhrases: ['best in the world'],
    });
    expect(created.brandVoice).toBe('Straightforward and trustworthy.');
    expect(created.forbiddenPhrases).toEqual(['best in the world']);

    const updated = await brandProfileRepository.upsert(clientId, { tone: 'Friendly' });
    expect(updated.tone).toBe('Friendly');
    // Second upsert call updates the SAME row, not a duplicate.
    expect(updated.id).toBe(created.id);
  });

  it('upserts the target audience', async () => {
    const created = await targetAudienceRepository.upsert(clientId, { primaryCustomer: 'Homeowners on septic systems' });
    expect(created.primaryCustomer).toBe('Homeowners on septic systems');
  });

  it('upserts the SEO profile', async () => {
    const created = await seoProfileRepository.upsert(clientId, {
      primaryKeywords: ['septic installation'],
      competitors: ['Competitor A'],
    });
    expect(created.primaryKeywords).toEqual(['septic installation']);
    expect(created.competitors).toEqual(['Competitor A']);
  });

  it('adds an offer', async () => {
    const offer = await offerRepository.add(clientId, { offerName: 'Free Inspection' });
    expect(offer.offerName).toBe('Free Inspection');
    expect(offer.active).toBe(true);

    const list = await offerRepository.listByClient(clientId);
    expect(list.some((o) => o.id === offer.id)).toBe(true);
  });

  it('adds a FAQ', async () => {
    const faq = await faqRepository.add(clientId, {
      question: 'How often should I pump my tank?',
      answer: 'Every 3-5 years depending on usage.',
    });
    expect(faq.question).toContain('pump my tank');

    const list = await faqRepository.listByClient(clientId);
    expect(list.some((f) => f.id === faq.id)).toBe(true);
  });

  it('adds a marketing note', async () => {
    const note = await marketingNoteRepository.add(clientId, { note: 'Prefers direct, factual copy.', priority: 2 });
    expect(note.note).toBe('Prefers direct, factual copy.');

    const list = await marketingNoteRepository.listByClient(clientId);
    expect(list.some((n) => n.id === note.id)).toBe(true);
  });

  it('saves content with the new platform/title/campaign/tags fields', async () => {
    const item = await contentRepository.create({
      clientId,
      type: 'SOCIAL_POST',
      platform: 'facebook',
      title: 'Fall promo',
      body: 'Book your inspection today.',
      campaign: 'fall-2026',
      tags: ['promo', 'seasonal'],
      metadata: {},
      createdBy: 'test',
      initialStatus: 'DRAFT',
    });

    expect(item.platform).toBe('facebook');
    expect(item.title).toBe('Fall promo');
    expect(item.campaign).toBe('fall-2026');
    expect(item.tags).toEqual(['promo', 'seasonal']);
    expect(item.status).toBe('DRAFT');
  });
});
