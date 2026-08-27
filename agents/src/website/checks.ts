import type { ClientContext, WebsiteEvidence, WebsiteEvidenceType, WebsiteFetchResult } from '@citadel/shared';
import { seoPromptV1 } from '@citadel/prompts';
import { runConversionChecks as runSeoConversionChecks } from '../seo/checks.js';

/**
 * Deterministic Website Intelligence analysis engine (Phase 7) — the
 * marketing/conversion/UX analogue of agents/src/seo/checks.ts. Every
 * strength/issue here comes from a fixed rule applied to the actually
 * fetched page and/or the client's stored context; the LLM never runs
 * these checks and never overrides their verdicts — see
 * prompts/src/website/v1.ts and ARCHITECTURE.md "Website Intelligence
 * Agent."
 *
 * "Website vs SEO" (master spec): where a signal genuinely overlaps with
 * the SEO Agent's own deterministic conversion checks (CTA presence,
 * phone visibility, contact path, trust signals, review signals), this
 * module calls agents/src/seo/checks.ts's runConversionChecks() directly
 * and re-labels its findings, rather than re-implementing the same regex
 * passes under a different name. Everything else here — forms,
 * click-to-call, CTA repetition, guarantees/certifications/financing,
 * customer-journey friction, content depth beyond word count, brand
 * consistency — is new and specific to "does this site turn visitors into
 * customers," not "does this site rank."
 *
 * Every finding is paired with an evidence entry of the same id in the
 * category's evidence list, so a recommendation that cites that id is
 * citing something a rule actually found — never an invented fact.
 */

export interface WebsiteCheckOutcome {
  score: number;
  strengths: string[];
  issues: string[];
  evidence: WebsiteEvidence[];
}

export interface WebsiteCustomerJourneyOutcome {
  score: number;
  strengths: string[];
  frictionPoints: string[];
  evidence: WebsiteEvidence[];
}

export interface WebsiteBrandOutcome {
  score: number;
  issues: string[];
  evidence: WebsiteEvidence[];
}

type IssueSeverity = 'critical' | 'warning' | 'info';

interface Finder {
  strengths: string[];
  issues: string[];
  evidence: WebsiteEvidence[];
  addStrength(message: string, evidenceType?: WebsiteEvidenceType): void;
  addIssue(message: string, severity?: IssueSeverity, evidenceType?: WebsiteEvidenceType): void;
  /** Records a fact without treating it as a strength or issue — e.g. "no data on file to evaluate this." */
  addNote(message: string, evidenceType?: WebsiteEvidenceType): void;
  penalty: number;
}

function createFinder(category: string): Finder {
  const strengths: string[] = [];
  const issues: string[] = [];
  const evidence: WebsiteEvidence[] = [];
  const penaltyByseverity: Record<IssueSeverity, number> = { critical: 25, warning: 12, info: 4 };
  let counter = 0;
  let penalty = 0;
  const nextId = () => `${category}-${++counter}`;

  return {
    strengths,
    issues,
    evidence,
    get penalty() {
      return penalty;
    },
    addStrength(message, evidenceType = 'website_evidence') {
      strengths.push(message);
      evidence.push({ id: nextId(), type: evidenceType, description: message });
    },
    addIssue(message, severity = 'warning', evidenceType = 'deterministic_rule') {
      issues.push(message);
      evidence.push({ id: nextId(), type: evidenceType, description: message });
      penalty += penaltyByseverity[severity];
    },
    addNote(message, evidenceType = 'client_knowledge') {
      evidence.push({ id: nextId(), type: evidenceType, description: message });
    },
  };
}

function scoreFromPenalty(penalty: number): number {
  return Math.max(0, 100 - penalty);
}

function textContainsAny(haystack: string, needles: string[]): string | null {
  const lower = haystack.toLowerCase();
  return needles.find((n) => lower.includes(n.toLowerCase())) ?? null;
}

function countOccurrences(haystack: string, needles: string[]): number {
  const lower = haystack.toLowerCase();
  return needles.reduce((sum, n) => sum + (lower.split(n.toLowerCase()).length - 1), 0);
}

// ---------------------------------------------------------------------------
// Deterministic-rule policy specific to the Website Agent (kept here, not in
// prompts/src/website/v1.ts, because unlike the SEO/review policy modules
// these are short, single-purpose keyword lists used by exactly one check
// each — see that file's own policy section for the ones the LLM prompt
// also needs to reference).
// ---------------------------------------------------------------------------

const BENEFIT_LANGUAGE_SIGNALS = ['so you can', 'peace of mind', "you'll enjoy", 'means you', 'so your', 'worry-free', 'without the hassle', 'so you never have to'];
const OBJECTION_HANDLING_SIGNALS = ['no obligation', 'free consultation', 'risk-free', 'satisfaction guarantee', 'no pressure', 'no hidden fees', 'money-back'];
const DIFFERENTIATION_SIGNALS = ['why choose us', 'what makes us different', 'our difference', 'unlike other', 'sets us apart', 'what sets us apart'];
const NEXT_STEPS_SIGNALS = ["what happens next", "here's how it works", 'step 1', "schedule your", 'book your free', 'request your free', 'how it works'];
const GUARANTEE_SIGNALS = ['guarantee', 'guaranteed', 'warranty'];
const CERTIFICATION_SIGNALS = ['certified', 'certification', 'accredited'];
const EXPERIENCE_CLAIM_SIGNALS = ['years of experience', 'years in business', 'since 19', 'since 20'];
const FINANCING_SIGNALS = ['financing', 'payment plan', '0% interest', 'flexible payment', 'accepts all major credit cards'];
const FAQ_HEADING_SIGNALS = ['faq', 'frequently asked question'];
export const THIN_CONTENT_WORD_THRESHOLD = seoPromptV1.THIN_CONTENT_WORD_THRESHOLD;

// ---------------------------------------------------------------------------
// First impression
// ---------------------------------------------------------------------------

export function runFirstImpressionChecks(page: WebsiteFetchResult, client: ClientContext, targetLocation?: string): WebsiteCheckOutcome {
  const f = createFinder('impression');
  const activeServices = client.services.filter((s) => s.active).map((s) => s.serviceName);
  const headlineText = [page.title ?? '', ...page.headings.filter((h) => h.level <= 2).map((h) => h.text)].join(' ');

  if (!page.title && page.h1Count === 0) {
    f.addIssue('The page has no title and no main heading — a first-time visitor has no immediate cue what this business does.', 'critical');
  } else {
    const relevanceTerms = [client.core.companyName, ...activeServices];
    const match = textContainsAny(headlineText, relevanceTerms);
    if (match) {
      f.addStrength(`The page's title/heading identifies "${match}", making it clear who the business is or what it offers.`);
    } else if (activeServices.length > 0) {
      f.addIssue("The page's title and top headings don't mention the company name or any known service — a visitor may not immediately understand what this business does.", 'warning');
    } else {
      f.addNote('No services on file for this client — headline service-clarity cannot be fully evaluated.');
    }
  }

  const audience = client.targetAudience;
  if (audience?.primaryCustomer) {
    const keywords = audience.primaryCustomer
      .split(/[\s,]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 3);
    const found = keywords.length > 0 && textContainsAny(page.textExcerpt, keywords);
    if (found) {
      f.addStrength(`The page's language appears to speak to the client's known target customer ("${audience.primaryCustomer}").`);
    } else if (keywords.length > 0) {
      f.addIssue(`The page doesn't clearly speak to the client's known target customer ("${audience.primaryCustomer}").`, 'info');
    }
  } else {
    f.addNote('No target audience on file for this client — whether the target customer is obvious cannot be fully evaluated.');
  }

  const activeAreas = client.serviceAreas.filter((a) => a.active);
  if (activeAreas.length > 0) {
    const areaNames = activeAreas.map((a) => a.name);
    const inHeadline = textContainsAny(headlineText, areaNames);
    if (inHeadline) {
      f.addStrength(`The service area ("${inHeadline}") is mentioned right in the title/heading — location is obvious at a glance.`);
    } else if (textContainsAny(page.textExcerpt, areaNames)) {
      f.addIssue('The service area is mentioned on the page, but not in the title/heading — a scanning visitor may not immediately see where this business operates.', 'info');
    } else if (targetLocation) {
      f.addIssue(`The requested target location ("${targetLocation}") does not appear to be mentioned anywhere on the page.`, 'warning');
    } else {
      f.addIssue('None of the known service areas are mentioned on the page — a visitor cannot immediately tell where this business operates.', 'warning');
    }
  } else {
    f.addNote('No service areas on file for this client — location obviousness cannot be fully evaluated.');
  }

  return { score: scoreFromPenalty(f.penalty), strengths: f.strengths, issues: f.issues, evidence: f.evidence };
}

// ---------------------------------------------------------------------------
// Conversion — reuses the SEO Agent's own conversion checks for the
// genuinely overlapping signals (CTA, phone, contact path, trust, review
// signals), then adds what's specific to a marketing/conversion audit.
// ---------------------------------------------------------------------------

export function runConversionChecks(page: WebsiteFetchResult, client: ClientContext): WebsiteCheckOutcome {
  const f = createFinder('conv');

  // --- Reused from the SEO Agent (see module doc comment) ---
  const seoConversion = runSeoConversionChecks(page, client);
  const seoIssueMessages = new Set(seoConversion.issues.map((i) => i.message));
  for (const issue of seoConversion.issues) {
    f.addIssue(issue.message, issue.severity, 'deterministic_rule');
  }
  for (const ev of seoConversion.evidence) {
    if (seoIssueMessages.has(ev.description)) continue; // already recorded via addIssue above — avoid a duplicate evidence entry
    if (ev.type === 'website_evidence') {
      f.addStrength(ev.description, ev.type);
    } else {
      f.addNote(ev.description, ev.type);
    }
  }

  // --- New: form presence ---
  if (page.formCount > 0) {
    f.addStrength(`The page has a quote/contact request form (${page.formCount} found) — visitors can reach out without leaving the page.`);
  } else {
    f.addIssue('No quote/contact request form was found — visitors must call or find another channel to reach out.', 'warning');
  }

  // --- New: click-to-call ---
  if (page.telLinks.length > 0) {
    f.addStrength('The phone number is a tappable click-to-call link — a mobile visitor can call with one tap.');
  } else if (client.core.phone) {
    f.addIssue('The phone number is not a clickable tel: link — mobile visitors must copy or manually dial it, a missed click-to-call opportunity.', 'info');
  }

  // --- New: CTA repetition ---
  const ctaOccurrences = countOccurrences(`${page.textExcerpt} ${page.links.map((l) => l.text).join(' ')}`, seoPromptV1.CTA_SIGNALS);
  if (ctaOccurrences >= 2) {
    f.addStrength('The call-to-action is repeated multiple times across the page, reinforcing what a visitor should do next.');
  }

  // --- New: guarantees / certifications / experience / financing — only reported when actually present, never flagged as missing ---
  const guarantee = textContainsAny(page.textExcerpt, GUARANTEE_SIGNALS);
  if (guarantee) f.addStrength(`A guarantee/warranty is mentioned ("${guarantee}").`);
  const certification = textContainsAny(page.textExcerpt, CERTIFICATION_SIGNALS);
  if (certification) f.addStrength(`A certification/accreditation is mentioned ("${certification}").`);
  const experience = textContainsAny(page.textExcerpt, EXPERIENCE_CLAIM_SIGNALS);
  if (experience) f.addStrength(`An experience claim is mentioned ("${experience}").`);
  const financing = textContainsAny(page.textExcerpt, FINANCING_SIGNALS);
  if (financing) f.addStrength(`Financing/payment information is mentioned ("${financing}").`);

  // --- New: service-area clarity (anywhere on page, distinct from first-impression's above-the-fold check) ---
  const activeAreas = client.serviceAreas.filter((a) => a.active);
  if (activeAreas.length > 0) {
    const mentioned = activeAreas.filter((a) => page.textExcerpt.toLowerCase().includes(a.name.toLowerCase()));
    if (mentioned.length === activeAreas.length) {
      f.addStrength('All of the client\'s known service areas are mentioned somewhere on the page.');
    } else if (mentioned.length > 0) {
      f.addIssue(`Only ${mentioned.length} of ${activeAreas.length} known service areas are mentioned on the page.`, 'info');
    } else {
      f.addIssue('None of the known service areas are mentioned anywhere on the page.', 'warning');
    }
  }

  return { score: scoreFromPenalty(f.penalty), strengths: f.strengths, issues: f.issues, evidence: f.evidence };
}

// ---------------------------------------------------------------------------
// Customer journey — synthesized from the conversion/first-impression
// signals (reframed as friction, not re-detected) plus a "what happens
// next" clarity check.
// ---------------------------------------------------------------------------

export function runCustomerJourneyChecks(
  page: WebsiteFetchResult,
  client: ClientContext,
  firstImpression: WebsiteCheckOutcome,
  conversion: WebsiteCheckOutcome,
): WebsiteCustomerJourneyOutcome {
  const f = createFinder('journey');

  if (firstImpression.issues.length === 0) {
    f.addStrength('A visitor can quickly understand what the company does and where it operates.');
  } else {
    for (const issue of firstImpression.issues) {
      f.addIssue(`Understanding the company: ${issue}`, 'warning');
    }
  }

  const trustIssues = conversion.issues.filter((issue) => /trust|review|testimonial/i.test(issue));
  if (trustIssues.length === 0) {
    f.addStrength('A visitor has some basis to trust the business before contacting it (trust/review signals present).');
  } else {
    for (const issue of trustIssues) {
      f.addIssue(`Deciding whether to trust the business: ${issue}`, 'warning');
    }
  }

  const hasContactPath = page.formCount > 0 || page.telLinks.length > 0;
  if (hasContactPath) {
    f.addStrength('A visitor can find a clear way to contact the business (form and/or click-to-call).');
  } else {
    f.addIssue('A visitor who decides to act has no obviously easy way to contact the business (no form, no click-to-call link).', 'critical');
  }

  const nextStepsMatch = textContainsAny(page.textExcerpt, NEXT_STEPS_SIGNALS);
  if (nextStepsMatch) {
    f.addStrength(`The page explains what happens after a visitor reaches out ("${nextStepsMatch}").`);
  } else {
    f.addIssue('The page never explains what happens after a visitor calls or submits a request — this can create hesitation to act.', 'info');
  }

  if (client.faqs.length > 0) {
    const faqHeading = page.headings.some((h) => FAQ_HEADING_SIGNALS.some((s) => h.text.toLowerCase().includes(s)));
    if (faqHeading) {
      f.addStrength('FAQs are presented on the page, helping visitors self-serve answers before contacting the business.');
    } else {
      f.addIssue('The business has FAQs on file, but they do not appear to be presented on the page — visitors must ask directly instead of self-serving an answer.', 'info');
    }
  }

  return { score: scoreFromPenalty(f.penalty), strengths: f.strengths, frictionPoints: f.issues, evidence: f.evidence };
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export function runContentChecks(page: WebsiteFetchResult, client: ClientContext, conversion: WebsiteCheckOutcome): WebsiteCheckOutcome {
  const f = createFinder('content');
  const activeServices = client.services.filter((s) => s.active).map((s) => s.serviceName);

  if (page.wordCount < THIN_CONTENT_WORD_THRESHOLD) {
    f.addIssue(`The page has only ${page.wordCount} words of visible text — likely too thin to fully explain the business's services and value.`, 'warning');
  } else {
    f.addStrength(`The page has ${page.wordCount} words of visible content.`);
  }

  if (activeServices.length > 0) {
    const found = activeServices.filter((s) => page.textExcerpt.toLowerCase().includes(s.toLowerCase()));
    if (found.length === activeServices.length) {
      f.addStrength('All of the client\'s known services are described on the page.');
    } else if (found.length > 0) {
      f.addIssue(`Only ${found.length} of ${activeServices.length} known services are mentioned on the page.`, 'info');
    } else {
      f.addIssue("None of the client's known services are mentioned anywhere on the page.", 'critical');
    }
  } else {
    f.addNote('No services on file for this client — service-content clarity cannot be fully evaluated.');
  }

  const benefit = textContainsAny(page.textExcerpt, BENEFIT_LANGUAGE_SIGNALS);
  if (benefit) {
    f.addStrength(`Content uses benefit-oriented language ("${benefit}") — explaining what the customer gets, not just what the service is.`);
  } else {
    f.addIssue('Content reads like a list of services/features without explaining what it means for the customer (no clear benefit-oriented language found).', 'info');
  }

  const objectionHandling = textContainsAny(page.textExcerpt, OBJECTION_HANDLING_SIGNALS);
  if (objectionHandling) {
    f.addStrength(`Objection-handling language is present ("${objectionHandling}"), easing visitor hesitation.`);
  } else {
    f.addIssue("No visible objection-handling language (e.g. \"no obligation,\" \"free consultation\") was found to ease visitor hesitation.", 'info');
  }

  const differentiation = textContainsAny(page.textExcerpt, DIFFERENTIATION_SIGNALS);
  if (differentiation) {
    f.addStrength(`The page explains what differentiates the business ("${differentiation}").`);
  } else {
    f.addIssue('No clear differentiation from competitors (e.g. "why choose us") was found on the page.', 'info');
  }

  const sentences = page.textExcerpt
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
  const duplicates = sentences.filter((s, i) => sentences.indexOf(s) !== i);
  if (duplicates.length > 0) {
    f.addIssue('The same sentence appears more than once on the page, which can read as padding or a copy-paste error.', 'info');
  }

  const activeOffers = client.offers.filter((o) => o.active);
  if (activeOffers.length > 0) {
    const mentioned = activeOffers.filter((o) => page.textExcerpt.toLowerCase().includes(o.offerName.toLowerCase()));
    if (mentioned.length === 0) {
      f.addIssue('The business has active offers on file, but none appear to be mentioned on the page.', 'info', 'client_knowledge');
    } else {
      f.addStrength(`Active offer(s) mentioned on the page: ${mentioned.map((o) => o.offerName).join('; ')}.`);
    }
  }

  // Calls to action is intentionally NOT re-detected here — it's the
  // Conversion category's finding, referenced rather than duplicated (see
  // module doc comment's "Website vs SEO" reuse rule, applied internally
  // between our own categories too).
  if (conversion.issues.some((i) => i.toLowerCase().includes('call-to-action'))) {
    f.addIssue('No clear call-to-action was found on the page (see Conversion) — content alone does not tell the visitor what to do next.', 'info');
  }

  return { score: scoreFromPenalty(f.penalty), strengths: f.strengths, issues: f.issues, evidence: f.evidence };
}

// ---------------------------------------------------------------------------
// Brand — compares retrieved page content against the client's own stated
// brand profile. No "strengths" list (see WebsiteBrandResultSchema's doc
// comment) — this category exists to flag mismatches, not praise
// conformance.
// ---------------------------------------------------------------------------

export function runBrandChecks(page: WebsiteFetchResult, client: ClientContext): WebsiteBrandOutcome {
  const f = createFinder('brand');
  const brand = client.brandProfile;

  if (!brand) {
    f.addNote('No brand profile on file for this client — brand consistency cannot be evaluated.');
    return { score: 100, issues: [], evidence: f.evidence };
  }

  for (const phrase of brand.forbiddenPhrases) {
    if (page.textExcerpt.toLowerCase().includes(phrase.toLowerCase())) {
      f.addIssue(`The page uses "${phrase}", which is on this client's forbidden-phrase list.`, 'critical');
    }
  }

  const headlineText = [page.title ?? '', ...page.headings.filter((h) => h.level <= 2).map((h) => h.text)].join(' ');
  if (!headlineText.toLowerCase().includes(client.core.companyName.toLowerCase())) {
    f.addIssue('The company name does not appear in the page title or top headings — a basic brand-identity gap.', 'warning');
  }

  const activeServices = client.services.filter((s) => s.active).map((s) => s.serviceName);
  if (activeServices.length > 0) {
    const found = activeServices.some((s) => page.textExcerpt.toLowerCase().includes(s.toLowerCase()));
    if (!found) {
      f.addIssue("None of the client's known services are described on the page — the site's positioning may not match what's actually on file.", 'warning');
    }
  }

  return { score: scoreFromPenalty(f.penalty), issues: f.issues, evidence: f.evidence };
}

// ---------------------------------------------------------------------------
// Mobile — always an honest "not tested" disclosure. See
// WebsiteMobileDisclosureSchema's doc comment: the fetch infrastructure
// never renders the page, so there is no real evidence to score a mobile
// experience against.
// ---------------------------------------------------------------------------

export function buildMobileDisclosure(): { tested: false; note: string } {
  return {
    tested: false,
    note: 'Mobile visual/responsive-layout testing was not performed. This audit analyzes the page\'s HTML and text content only — it does not render the page or inspect its appearance on a mobile device. A manual mobile review is recommended before drawing conclusions about mobile UX.',
  };
}
