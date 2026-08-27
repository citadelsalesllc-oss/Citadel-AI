import type {
  Client as ClientRow,
  Service as ServiceRow,
  ServiceArea as ServiceAreaRow,
  BrandProfile as BrandProfileRow,
  TargetAudience as TargetAudienceRow,
  SeoProfile as SeoProfileRow,
  Offer as OfferRow,
  Faq as FaqRow,
  MarketingNote as MarketingNoteRow,
  ContentItem as ContentItemRow,
  SeoAudit as SeoAuditRow,
  Review as ReviewRow,
  ReviewResponseVersion as ReviewResponseVersionRow,
  AuditLog as AuditLogRow,
} from '@prisma/client';
import type {
  ClientRecord,
  Service,
  ServiceArea,
  BrandProfile,
  TargetAudience,
  SeoProfile,
  Offer,
  Faq,
  MarketingNote,
  ContentItem,
  SeoAuditRecord,
  SeoAuditResult,
  Review,
  ReviewResponseVersion,
  AuditLogEntry,
} from '@citadel/shared';

export function toClientRecord(row: ClientRow): ClientRecord {
  return {
    id: row.id,
    slug: row.slug,
    companyName: row.companyName,
    legalName: row.legalName,
    industry: row.industry,
    description: row.description,
    website: row.website,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    timezone: row.timezone,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toService(row: ServiceRow): Service {
  return {
    id: row.id,
    clientId: row.clientId,
    serviceName: row.serviceName,
    description: row.description,
    priority: row.priority,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toServiceArea(row: ServiceAreaRow): ServiceArea {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    city: row.city,
    state: row.state,
    priority: row.priority,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toBrandProfile(row: BrandProfileRow): BrandProfile {
  return {
    id: row.id,
    clientId: row.clientId,
    brandVoice: row.brandVoice,
    tone: row.tone,
    preferredPhrases: row.preferredPhrases,
    forbiddenPhrases: row.forbiddenPhrases,
    writingStyle: row.writingStyle,
    emojiPolicy: row.emojiPolicy,
    capitalizationPreferences: row.capitalizationPreferences,
    ctaPreferences: row.ctaPreferences,
    otherRules: row.otherRules,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toTargetAudience(row: TargetAudienceRow): TargetAudience {
  return {
    id: row.id,
    clientId: row.clientId,
    primaryCustomer: row.primaryCustomer,
    secondaryCustomers: row.secondaryCustomers,
    customerProblems: row.customerProblems,
    buyingMotivations: row.buyingMotivations,
    objections: row.objections,
    geographicTargeting: row.geographicTargeting,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toSeoProfile(row: SeoProfileRow): SeoProfile {
  return {
    id: row.id,
    clientId: row.clientId,
    primaryKeywords: row.primaryKeywords,
    secondaryKeywords: row.secondaryKeywords,
    targetLocations: row.targetLocations,
    priorityServices: row.priorityServices,
    searchIntent: row.searchIntent,
    competitors: row.competitors,
    seoNotes: row.seoNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    clientId: row.clientId,
    offerName: row.offerName,
    description: row.description,
    cta: row.cta,
    restrictions: row.restrictions,
    active: row.active,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toFaq(row: FaqRow): Faq {
  return {
    id: row.id,
    clientId: row.clientId,
    question: row.question,
    answer: row.answer,
    category: row.category,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMarketingNote(row: MarketingNoteRow): MarketingNote {
  return {
    id: row.id,
    clientId: row.clientId,
    note: row.note,
    category: row.category,
    priority: row.priority,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toContentItem(row: ContentItemRow): ContentItem {
  return {
    id: row.id,
    clientId: row.clientId,
    type: row.type,
    status: row.status,
    platform: row.platform,
    title: row.title,
    body: row.body,
    campaign: row.campaign,
    tags: row.tags,
    metadata: row.metadata as Record<string, unknown>,
    createdBy: row.createdBy,
    reviewer: row.reviewer,
    approvedAt: row.approvedAt,
    publishedAt: row.publishedAt,
    externalId: row.externalId,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toSeoAuditRecord(row: SeoAuditRow): SeoAuditRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    url: row.url,
    overallScore: row.overallScore,
    result: row.result as unknown as SeoAuditResult,
    agentVersion: row.agentVersion,
    modelProvider: row.modelProvider,
    modelUsed: row.modelUsed,
    createdAt: row.createdAt,
  };
}

export function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    clientId: row.clientId,
    externalId: row.externalId,
    source: row.source,
    reviewerName: row.reviewerName,
    rating: row.rating,
    reviewText: row.reviewText,
    reviewDate: row.reviewDate,
    responseStatus: row.responseStatus,
    responseText: row.responseText,
    responseDate: row.responseDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toReviewResponseVersion(row: ReviewResponseVersionRow): ReviewResponseVersion {
  return {
    id: row.id,
    reviewId: row.reviewId,
    responseText: row.responseText,
    tone: row.tone,
    cta: row.cta,
    qaPassed: row.qaPassed,
    qaIssues: row.qaIssues as unknown[],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    clientId: row.clientId,
    actor: row.actor,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}
