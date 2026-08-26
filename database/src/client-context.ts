import { ClientNotFoundError, type ClientContext } from '@citadel/shared';
import { prisma } from './prisma.js';
import {
  toClientRecord,
  toService,
  toServiceArea,
  toBrandProfile,
  toTargetAudience,
  toSeoProfile,
  toOffer,
  toFaq,
  toMarketingNote,
} from './mappers.js';

const RECENT_CONTENT_LIMIT = 10;

/**
 * The knowledge-retrieval service: everything a Citadel AI agent may need
 * to know about one client, assembled in a single query and returned in a
 * shape that requires no knowledge of the underlying tables (ClientContext,
 * defined in @citadel/shared). This is the ONLY sanctioned way agents
 * obtain client facts — see the `client_context` tool in @citadel/tools,
 * which wraps this for agent/skill use, and ARCHITECTURE.md "Client memory
 * system".
 *
 * `clientIdOrSlug` may be either the client's id or its slug; internally
 * resolved to a real client id before any child-table query runs, so a
 * request for one client can never leak another's rows.
 */
export async function getClientContext(clientIdOrSlug: string): Promise<ClientContext> {
  const row = await prisma.client.findFirst({
    where: { OR: [{ id: clientIdOrSlug }, { slug: clientIdOrSlug }] },
    include: {
      services: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] },
      serviceAreas: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] },
      brandProfile: true,
      targetAudience: true,
      seoProfile: true,
      offers: { orderBy: { createdAt: 'desc' } },
      faqs: { orderBy: { createdAt: 'asc' } },
      marketingNotes: { orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] },
      contentItems: {
        orderBy: { createdAt: 'desc' },
        take: RECENT_CONTENT_LIMIT,
        select: { id: true, type: true, platform: true, title: true, status: true, createdAt: true },
      },
    },
  });

  if (!row) {
    throw new ClientNotFoundError(clientIdOrSlug);
  }

  return {
    core: toClientRecord(row),
    services: row.services.map(toService),
    serviceAreas: row.serviceAreas.map(toServiceArea),
    brandProfile: row.brandProfile ? toBrandProfile(row.brandProfile) : null,
    targetAudience: row.targetAudience ? toTargetAudience(row.targetAudience) : null,
    seoProfile: row.seoProfile ? toSeoProfile(row.seoProfile) : null,
    offers: row.offers.map(toOffer),
    faqs: row.faqs.map(toFaq),
    marketingNotes: row.marketingNotes.map(toMarketingNote),
    recentContent: row.contentItems.map((item) => ({
      id: item.id,
      type: item.type,
      platform: item.platform,
      title: item.title,
      status: item.status,
      createdAt: item.createdAt,
    })),
  };
}
