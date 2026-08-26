import type { Client as PrismaClientRow, ContentItem as PrismaContentItemRow, AuditLog as PrismaAuditLogRow } from '@prisma/client';
import type { BrandRules, ClientProfile, ContentItem, AuditLogEntry, Faq, Offer, Competitor, Service } from '@citadel/shared';

export function toClientProfile(row: PrismaClientRow): ClientProfile {
  return {
    id: row.id,
    slug: row.slug,
    companyName: row.companyName,
    description: row.description ?? undefined,
    industry: row.industry ?? undefined,
    serviceArea: row.serviceArea,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    website: row.website ?? undefined,
    services: row.services as Service[],
    targetCustomers: row.targetCustomers,
    brandRules: row.brandRules as BrandRules,
    offers: row.offers as Offer[],
    competitors: row.competitors as Competitor[],
    seoKeywords: row.seoKeywords,
    locations: row.locations,
    faqs: row.faqs as Faq[],
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toContentItem(row: PrismaContentItemRow): ContentItem {
  return {
    id: row.id,
    clientId: row.clientId,
    type: row.type,
    status: row.status,
    body: row.body,
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

export function toAuditLogEntry(row: PrismaAuditLogRow): AuditLogEntry {
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
