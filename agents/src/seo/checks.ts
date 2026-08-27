import type { ClientContext, SeoEvidence, SeoEvidenceType, SeoIssue, SeoIssueSeverity, WebsiteFetchResult } from '@citadel/shared';
import { seoPromptV1 } from '@citadel/prompts';

/**
 * Deterministic SEO analysis engine — the SEO analogue of
 * agents/src/brand-qa/checks.ts. Every technical/on-page/local-SEO/
 * conversion finding here comes from a fixed rule applied to the actually
 * fetched page (agents/src/seo/checks.ts never re-fetches anything itself
 * — see seo-agent.ts) and/or the client's stored context. The LLM never
 * runs these checks and never overrides their verdicts — see
 * prompts/src/seo/v1.ts and ARCHITECTURE.md "SEO analysis pipeline."
 *
 * Every issue this module raises is paired with an evidence entry of the
 * SAME id, so a recommendation that cites that id is citing something a
 * rule actually found — never an invented fact.
 */

export interface SeoCheckOutcome {
  score: number;
  issues: SeoIssue[];
  evidence: SeoEvidence[];
}

interface Finder {
  issues: SeoIssue[];
  evidence: SeoEvidence[];
  addIssue(code: string, message: string, severity: SeoIssueSeverity, evidenceType?: SeoEvidenceType): void;
  addEvidence(description: string, evidenceType?: SeoEvidenceType): void;
}

function createFinder(category: string): Finder {
  const issues: SeoIssue[] = [];
  const evidence: SeoEvidence[] = [];
  let counter = 0;
  const nextId = () => `${category}-${++counter}`;

  return {
    issues,
    evidence,
    addIssue(code, message, severity, evidenceType = 'deterministic_rule') {
      const id = nextId();
      issues.push({ code, message, severity });
      evidence.push({ id, type: evidenceType, description: message });
    },
    addEvidence(description, evidenceType = 'website_evidence') {
      evidence.push({ id: nextId(), type: evidenceType, description });
    },
  };
}

function scoreFromIssues(issues: SeoIssue[]): number {
  const penalty = { critical: 25, warning: 10, info: 3 } satisfies Record<SeoIssueSeverity, number>;
  const total = issues.reduce((sum, issue) => sum + penalty[issue.severity], 0);
  return Math.max(0, 100 - total);
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function textContainsAny(haystack: string, needles: string[]): string | null {
  const lower = haystack.toLowerCase();
  return needles.find((n) => lower.includes(n.toLowerCase())) ?? null;
}

/** True if two consecutive headings skip a level (e.g. H1 straight to H3, with no H2 in between). */
function hasHeadingHierarchyGap(headings: WebsiteFetchResult['headings']): boolean {
  let previousLevel = 0;
  for (const heading of headings) {
    if (previousLevel > 0 && heading.level > previousLevel + 1) return true;
    previousLevel = heading.level;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Technical
// ---------------------------------------------------------------------------

export function runTechnicalChecks(page: WebsiteFetchResult): SeoCheckOutcome {
  const f = createFinder('tech');

  if (!page.ok) {
    f.addIssue('HTTP_ERROR_STATUS', `Page returned HTTP ${page.statusCode}, which prevents indexing and ranking.`, 'critical');
  } else {
    f.addEvidence(`Page returned HTTP ${page.statusCode} OK.`);
  }

  if (!page.https) {
    f.addIssue('NOT_HTTPS', 'Page is served over HTTP, not HTTPS — a ranking and trust signal in modern search.', 'critical');
  } else {
    f.addEvidence('Page is served over HTTPS.');
  }

  if (!page.title) {
    f.addIssue('MISSING_TITLE', 'Missing <title> tag.', 'critical');
  } else {
    f.addEvidence(`Title tag: "${page.title}".`);
    if (page.title.length < seoPromptV1.TITLE_MIN_LENGTH || page.title.length > seoPromptV1.TITLE_MAX_LENGTH) {
      f.addIssue(
        'TITLE_LENGTH',
        `Title is ${page.title.length} characters (recommended ${seoPromptV1.TITLE_MIN_LENGTH}-${seoPromptV1.TITLE_MAX_LENGTH}).`,
        'warning',
      );
    }
  }

  if (!page.metaDescription) {
    f.addIssue('MISSING_META_DESCRIPTION', 'Missing meta description.', 'critical');
  } else {
    f.addEvidence(`Meta description: "${page.metaDescription}".`);
    if (page.metaDescription.length < seoPromptV1.META_DESCRIPTION_MIN_LENGTH || page.metaDescription.length > seoPromptV1.META_DESCRIPTION_MAX_LENGTH) {
      f.addIssue(
        'META_DESCRIPTION_LENGTH',
        `Meta description is ${page.metaDescription.length} characters (recommended ${seoPromptV1.META_DESCRIPTION_MIN_LENGTH}-${seoPromptV1.META_DESCRIPTION_MAX_LENGTH}).`,
        'warning',
      );
    }
  }

  if (!page.canonicalUrl) {
    f.addIssue('MISSING_CANONICAL', 'Missing canonical URL tag.', 'warning');
  } else {
    f.addEvidence(`Canonical URL: "${page.canonicalUrl}".`);
  }

  if (page.h1Count === 0) {
    f.addIssue('MISSING_H1', 'Missing H1 heading.', 'critical');
  } else {
    const firstH1 = page.headings.find((h) => h.level === 1);
    if (firstH1) f.addEvidence(`H1 heading: "${firstH1.text}".`);
    if (page.h1Count > 1) {
      f.addIssue('MULTIPLE_H1', `${page.h1Count} H1 headings found; a page should generally have exactly one.`, 'warning');
    }
  }

  if (page.headings.length > 0 && hasHeadingHierarchyGap(page.headings)) {
    f.addIssue('HEADING_HIERARCHY_GAP', 'Heading levels skip a step (e.g. H1 straight to H3), which can confuse search engines and assistive tech.', 'warning');
  }

  if (page.metaRobots?.toLowerCase().includes('noindex')) {
    f.addIssue('NOINDEX', 'The page\'s meta robots tag includes "noindex", telling search engines not to index it.', 'critical');
  }

  if (!page.robotsTxt.exists) {
    f.addIssue('NO_ROBOTS_TXT', 'No robots.txt found at the site root.', 'info');
  } else if (page.robotsTxt.blocksAll) {
    f.addIssue('ROBOTS_TXT_BLOCKS_ALL', 'robots.txt disallows all crawling for all user agents.', 'warning');
  } else {
    f.addEvidence('robots.txt is present and does not block all crawling.');
  }

  if (!page.sitemap.exists) {
    f.addIssue('NO_SITEMAP', 'No sitemap.xml found at the site root.', 'warning');
  } else {
    f.addEvidence('sitemap.xml is present at the site root.');
  }

  return { score: scoreFromIssues(f.issues), issues: f.issues, evidence: f.evidence };
}

// ---------------------------------------------------------------------------
// On-page
// ---------------------------------------------------------------------------

export function runOnPageChecks(page: WebsiteFetchResult, client: ClientContext, targetService?: string, targetLocation?: string): SeoCheckOutcome {
  const f = createFinder('onpage');
  const activeServices = client.services.filter((s) => s.active).map((s) => s.serviceName);
  const relevanceTerms = [...activeServices, ...(targetService ? [targetService] : []), client.core.companyName];

  if (page.title) {
    const match = textContainsAny(page.title, relevanceTerms);
    if (!match) {
      f.addIssue('TITLE_NOT_RELEVANT', "Title does not appear to mention any of the client's known services or the company name.", 'warning');
    } else {
      f.addEvidence(`Title mentions "${match}".`);
    }
  }

  if (page.metaDescription) {
    const match = textContainsAny(page.metaDescription, relevanceTerms);
    if (!match) {
      f.addIssue('META_DESCRIPTION_NOT_RELEVANT', "Meta description does not appear to mention any of the client's known services.", 'warning');
    }
  }

  if (page.h1Count > 0) {
    const h1Text = page.headings.filter((h) => h.level === 1).map((h) => h.text).join(' ');
    const match = textContainsAny(h1Text, relevanceTerms);
    if (!match) {
      f.addIssue('H1_NOT_RELEVANT', "H1 heading does not appear to mention any of the client's known services.", 'warning');
    }
  }

  if (client.seoProfile && client.seoProfile.primaryKeywords.length > 0) {
    const found = client.seoProfile.primaryKeywords.filter((k) => page.textExcerpt.toLowerCase().includes(k.toLowerCase()));
    if (found.length === 0) {
      f.addIssue('NO_PRIMARY_KEYWORDS_FOUND', "None of the client's primary SEO keywords appear on the page.", 'warning');
    } else {
      f.addEvidence(`Primary keyword(s) found on page: ${found.join('; ')}.`, 'client_knowledge');
    }
  } else {
    f.addEvidence('No SEO profile on file for this client — keyword targeting cannot be evaluated beyond services/areas.', 'client_knowledge');
  }

  if (activeServices.length > 0) {
    const found = activeServices.filter((s) => page.textExcerpt.toLowerCase().includes(s.toLowerCase()));
    if (found.length === 0) {
      f.addIssue('NO_SERVICES_MENTIONED', "None of the client's known services are mentioned anywhere on the page.", 'critical');
    } else {
      f.addEvidence(`Service(s) mentioned on page: ${found.join('; ')}.`, 'client_knowledge');
    }
  } else {
    f.addEvidence('No services on file for this client — service relevance cannot be evaluated.', 'client_knowledge');
  }

  const activeAreas = client.serviceAreas.filter((a) => a.active).map((a) => a.name);
  if (activeAreas.length > 0) {
    const found = activeAreas.filter((a) => page.textExcerpt.toLowerCase().includes(a.toLowerCase()));
    if (found.length === 0) {
      f.addIssue('NO_SERVICE_AREAS_MENTIONED', "None of the client's known service areas are mentioned on the page.", 'warning');
    }
  }

  if (targetLocation && !page.textExcerpt.toLowerCase().includes(targetLocation.toLowerCase())) {
    f.addIssue('TARGET_LOCATION_NOT_ON_PAGE', `The requested target location ("${targetLocation}") does not appear on the page.`, 'warning');
  }

  if (page.wordCount < seoPromptV1.THIN_CONTENT_WORD_THRESHOLD) {
    f.addIssue('THIN_CONTENT', `Page has only ${page.wordCount} words of visible text — likely too thin for strong topical relevance.`, 'warning');
  } else {
    f.addEvidence(`Page has ${page.wordCount} words of visible text.`);
  }

  if (page.internalLinkCount === 0) {
    f.addIssue('NO_INTERNAL_LINKS', 'No internal links found on the page.', 'warning');
  }

  return { score: scoreFromIssues(f.issues), issues: f.issues, evidence: f.evidence };
}

// ---------------------------------------------------------------------------
// Local SEO
// ---------------------------------------------------------------------------

export function runLocalSeoChecks(page: WebsiteFetchResult, client: ClientContext, targetService?: string, targetLocation?: string): SeoCheckOutcome {
  const f = createFinder('local');
  const activeAreas = client.serviceAreas.filter((a) => a.active);
  const hasLocalData = activeAreas.length > 0 || (client.seoProfile?.targetLocations.length ?? 0) > 0;

  if (!hasLocalData) {
    f.addIssue(
      'NO_LOCAL_DATA_ON_FILE',
      'No service areas or target locations on file for this client — local SEO cannot be fully evaluated.',
      'info',
      'client_knowledge',
    );
  }

  const lowerText = page.textExcerpt.toLowerCase();
  const mentionedAreas = activeAreas.filter((a) => lowerText.includes(a.name.toLowerCase()));
  const unmentionedAreas = activeAreas.filter((a) => !lowerText.includes(a.name.toLowerCase()));

  if (activeAreas.length > 0 && mentionedAreas.length === 0) {
    f.addIssue('NO_SERVICE_AREA_MENTIONED', "None of the client's known service areas are mentioned anywhere on the page.", 'critical');
  } else if (mentionedAreas.length > 0) {
    f.addEvidence(`Service area(s) mentioned on page: ${mentionedAreas.map((a) => a.name).join('; ')}.`, 'client_knowledge');
  }

  if (targetLocation && activeAreas.length > 0 && !activeAreas.some((a) => a.name.toLowerCase() === targetLocation.toLowerCase())) {
    f.addIssue(
      'TARGET_LOCATION_NOT_A_KNOWN_SERVICE_AREA',
      `The requested target location ("${targetLocation}") is not among the client's known service areas — recommendations for it cannot be grounded in client data.`,
      'info',
      'client_knowledge',
    );
  }

  for (const area of unmentionedAreas.slice(0, 3)) {
    f.addIssue(
      'SERVICE_AREA_OPPORTUNITY',
      `Service area "${area.name}" is on file but not mentioned on the page — a potential local SEO opportunity.`,
      'info',
      'client_knowledge',
    );
  }

  if (targetService && !lowerText.includes(targetService.toLowerCase())) {
    f.addIssue('TARGET_SERVICE_NOT_ON_PAGE', `The requested target service ("${targetService}") does not appear on the page.`, 'warning');
  }

  const localIntentSignals = ['serving', 'located in', 'near me', 'local'];
  if (!textContainsAny(page.textExcerpt, localIntentSignals) && activeAreas.length > 0) {
    f.addIssue('NO_LOCAL_INTENT_PHRASING', 'Page does not use common local-intent phrasing (e.g., "serving <area>", "local").', 'info');
  }

  if (client.core.phone) {
    const clientDigits = normalizeDigits(client.core.phone);
    const pageDigitsMatches = (page.textExcerpt.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) ?? []).map(normalizeDigits);
    if (!pageDigitsMatches.includes(clientDigits)) {
      f.addIssue(
        'PHONE_NAP_MISMATCH',
        "Client's phone number on file does not appear anywhere on the page — NAP (name/address/phone) consistency matters for local SEO.",
        'warning',
      );
    } else {
      f.addEvidence('Client phone number on file appears on the page (NAP consistent).', 'client_knowledge');
    }
  }

  return { score: scoreFromIssues(f.issues), issues: f.issues, evidence: f.evidence };
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

export function runConversionChecks(page: WebsiteFetchResult, client: ClientContext): SeoCheckOutcome {
  const f = createFinder('conv');
  const linkTexts = page.links.map((l) => l.text).join(' ');
  const combinedText = `${page.textExcerpt} ${linkTexts}`;

  const ctaMatch = textContainsAny(combinedText, seoPromptV1.CTA_SIGNALS);
  if (!ctaMatch) {
    f.addIssue('NO_CLEAR_CTA', 'No clear call-to-action phrase (e.g., "Call Now", "Get a Quote") found on the page.', 'critical');
  } else {
    f.addEvidence(`Call-to-action phrase found: "${ctaMatch}".`);
  }

  if (client.core.phone) {
    const clientDigits = normalizeDigits(client.core.phone);
    const textDigitsMatches = (page.textExcerpt.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) ?? []).map(normalizeDigits);
    const telLinkMatches = page.links.some((l) => l.href.startsWith('tel:') && normalizeDigits(l.href) === clientDigits);
    if (!textDigitsMatches.includes(clientDigits) && !telLinkMatches) {
      f.addIssue('PHONE_NOT_VISIBLE', "Client's phone number is on file but does not appear visibly on the page.", 'warning');
    } else {
      f.addEvidence('Client phone number is visible on the page.');
    }
  } else {
    f.addEvidence('No phone number on file for this client — phone visibility cannot be evaluated.', 'client_knowledge');
  }

  const contactPathMatch = textContainsAny(combinedText, seoPromptV1.CONTACT_PATH_SIGNALS) || linkTexts.toLowerCase().includes('contact');
  if (!contactPathMatch) {
    f.addIssue('NO_CONTACT_PATH', 'No clear contact/quote request path found on the page.', 'warning');
  }

  const trustMatch = textContainsAny(page.textExcerpt, seoPromptV1.TRUST_SIGNAL_PATTERNS);
  if (!trustMatch) {
    f.addIssue('NO_TRUST_SIGNALS', 'No trust signals (licensed/insured/certified/years in business/etc.) found on the page.', 'info');
  } else {
    f.addEvidence(`Trust signal found: "${trustMatch}".`);
  }

  const reviewMatch = textContainsAny(page.textExcerpt, seoPromptV1.REVIEW_SIGNAL_PATTERNS);
  if (!reviewMatch) {
    f.addIssue('NO_REVIEW_SIGNALS', 'No reviews or testimonials referenced on the page.', 'info');
  }

  return { score: scoreFromIssues(f.issues), issues: f.issues, evidence: f.evidence };
}
