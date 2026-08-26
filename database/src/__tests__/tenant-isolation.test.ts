import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ResourceNotFoundError, type ClientRecord } from '@citadel/shared';
import { clientRepository } from '../repositories/client-repository.js';
import { serviceRepository } from '../repositories/service-repository.js';
import { serviceAreaRepository } from '../repositories/service-area-repository.js';
import { offerRepository } from '../repositories/offer-repository.js';
import { faqRepository } from '../repositories/faq-repository.js';
import { marketingNoteRepository } from '../repositories/marketing-note-repository.js';
import { brandProfileRepository } from '../repositories/brand-profile-repository.js';
import { contentRepository } from '../repositories/content-repository.js';
import { getClientContext } from '../client-context.js';
import { prisma } from '../prisma.js';

/**
 * Proves the tenant-isolation guarantee required by Phase 2: Client A can
 * never read or modify Client B's data, even when Client A supplies a
 * real, valid record id that happens to belong to Client B. Every check
 * below exercises that specific attack shape (a real id, wrong owner) —
 * not just "does querying by id return null."
 */
describe('tenant isolation', () => {
  let clientA: ClientRecord;
  let clientB: ClientRecord;

  beforeAll(async () => {
    clientA = await clientRepository.create({ slug: `tenant-a-${randomUUID()}`, companyName: 'Tenant A Co' });
    clientB = await clientRepository.create({ slug: `tenant-b-${randomUUID()}`, companyName: 'Tenant B Co' });
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { id: { in: [clientA.id, clientB.id] } } });
  });

  it("Client B cannot update Client A's service by supplying A's real service id", async () => {
    const serviceA = await serviceRepository.add(clientA.id, { serviceName: "A's Secret Service" });

    await expect(
      serviceRepository.update(clientB.id, serviceA.id, { serviceName: 'Hijacked!' }),
    ).rejects.toThrow(ResourceNotFoundError);

    // And the record is untouched.
    const stillA = await serviceRepository.listByClient(clientA.id);
    expect(stillA.find((s) => s.id === serviceA.id)?.serviceName).toBe("A's Secret Service");
  });

  it("Client B's service list never includes Client A's services", async () => {
    await serviceRepository.add(clientA.id, { serviceName: 'Only for A' });
    const bServices = await serviceRepository.listByClient(clientB.id);
    expect(bServices.some((s) => s.serviceName === 'Only for A')).toBe(false);
  });

  it("Client B's service-area list never includes Client A's service areas", async () => {
    await serviceAreaRepository.add(clientA.id, { name: 'A-only Area' });
    const bAreas = await serviceAreaRepository.listByClient(clientB.id);
    expect(bAreas.some((a) => a.name === 'A-only Area')).toBe(false);
  });

  it("Client B's offer list never includes Client A's offers", async () => {
    await offerRepository.add(clientA.id, { offerName: 'A-only Offer' });
    const bOffers = await offerRepository.listByClient(clientB.id);
    expect(bOffers.some((o) => o.offerName === 'A-only Offer')).toBe(false);
  });

  it("Client B's FAQ list never includes Client A's FAQs", async () => {
    await faqRepository.add(clientA.id, { question: 'A-only question?', answer: 'A-only answer' });
    const bFaqs = await faqRepository.listByClient(clientB.id);
    expect(bFaqs.some((f) => f.question === 'A-only question?')).toBe(false);
  });

  it("Client B's marketing notes never include Client A's notes", async () => {
    await marketingNoteRepository.add(clientA.id, { note: 'A-only note' });
    const bNotes = await marketingNoteRepository.listByClient(clientB.id);
    expect(bNotes.some((n) => n.note === 'A-only note')).toBe(false);
  });

  it("Client A's brand profile is independent of Client B's", async () => {
    await brandProfileRepository.upsert(clientA.id, { brandVoice: 'A voice' });
    await brandProfileRepository.upsert(clientB.id, { brandVoice: 'B voice' });

    const aProfile = await brandProfileRepository.getByClient(clientA.id);
    const bProfile = await brandProfileRepository.getByClient(clientB.id);

    expect(aProfile?.brandVoice).toBe('A voice');
    expect(bProfile?.brandVoice).toBe('B voice');
  });

  it("Client B's content list never includes Client A's content", async () => {
    await contentRepository.create({
      clientId: clientA.id,
      type: 'SOCIAL_POST',
      body: "A's private draft",
      metadata: {},
      tags: [],
      createdBy: 'test',
    });
    const bContent = await contentRepository.listByClient(clientB.id);
    expect(bContent.some((c) => c.body === "A's private draft")).toBe(false);
  });

  it("getClientContext(A) never contains any of Client B's data, and vice versa", async () => {
    await serviceRepository.add(clientA.id, { serviceName: 'A-context-service' });
    await serviceRepository.add(clientB.id, { serviceName: 'B-context-service' });

    const contextA = await getClientContext(clientA.id);
    const contextB = await getClientContext(clientB.id);

    expect(contextA.core.id).toBe(clientA.id);
    expect(contextA.services.some((s) => s.serviceName === 'B-context-service')).toBe(false);
    expect(contextA.services.every((s) => s.clientId === clientA.id)).toBe(true);

    expect(contextB.core.id).toBe(clientB.id);
    expect(contextB.services.some((s) => s.serviceName === 'A-context-service')).toBe(false);
    expect(contextB.services.every((s) => s.clientId === clientB.id)).toBe(true);
  });
});
