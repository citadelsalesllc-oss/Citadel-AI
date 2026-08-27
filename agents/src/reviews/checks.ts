import type { ClientContext, Review, ReviewAnalysisResult, ReviewClassification, ReviewEvidence, ReviewEvidenceType } from '@citadel/shared';
import { reviewPromptV1 } from '@citadel/prompts';

/**
 * Deterministic review analysis engine — the review analogue of
 * agents/src/seo/checks.ts and agents/src/brand-qa/checks.ts. Every field
 * in ReviewAnalysisResult comes from a fixed rule applied to the review's
 * actual text/rating and the client's stored context, never from a model
 * call — see prompts/src/reviews/v1.ts for the keyword-list policy this
 * applies, and ARCHITECTURE.md "Review Intelligence pipeline" for why
 * `review_analyze` needs no LLM at all.
 */

interface Finder {
  evidence: ReviewEvidence[];
  add(description: string, type?: ReviewEvidenceType): string;
}

function createFinder(category: string): Finder {
  const evidence: ReviewEvidence[] = [];
  let counter = 0;
  return {
    evidence,
    add(description, type = 'review_text') {
      const id = `${category}-${++counter}`;
      evidence.push({ id, type, description });
      return id;
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary matching, not plain substring — `.includes()` would match
 * the praise signal "professional" inside the complaint word
 * "unprofessional", which is exactly backwards. `\b` correctly refuses to
 * match "professional" as a substring of a different word.
 */
function findMatches(text: string, signals: readonly string[]): string[] {
  return signals.filter((s) => new RegExp(`\\b${escapeRegExp(s.toLowerCase())}\\b`, 'i').test(text));
}

/**
 * Coarse rating + keyword-presence classification — never a numeric
 * sentiment score, since the underlying method doesn't support claiming
 * one. Both praise and complaint signals present means "mixed" regardless
 * of the star rating, since a reviewer can leave a high rating with a
 * caveat (or vice versa).
 */
function classify(rating: number, praiseMatches: string[], complaintMatches: string[]): ReviewClassification {
  if (praiseMatches.length > 0 && complaintMatches.length > 0) return 'mixed';
  if (praiseMatches.length > 0 || rating >= 4) return 'positive';
  if (complaintMatches.length > 0 || rating <= 2) return 'negative';
  return 'neutral';
}

const ESCALATION_CATEGORY_LABELS: Record<string, string> = {
  legal_threat: 'a possible legal threat',
  safety_allegation: 'a safety allegation',
  injury_claim: 'a claimed injury',
  fraud_allegation: 'a fraud allegation',
  discrimination_allegation: 'a discrimination allegation',
  threat: 'a threat',
  sensitive_complaint: 'a highly sensitive complaint',
};

export function analyzeReview(review: Review, client: ClientContext): ReviewAnalysisResult {
  const f = createFinder('review');
  const text = review.reviewText;

  const praiseMatches = findMatches(text, reviewPromptV1.PRAISE_SIGNALS);
  const complaintMatches = findMatches(text, reviewPromptV1.COMPLAINT_SIGNALS);
  const actionMatches = findMatches(text, reviewPromptV1.ACTION_REQUEST_SIGNALS);
  const urgencyMatches = findMatches(text, reviewPromptV1.URGENCY_SIGNALS);

  const classification = classify(review.rating, praiseMatches, complaintMatches);
  f.add(`Classified as "${classification}" from a ${review.rating}/5 rating and ${praiseMatches.length} positive / ${complaintMatches.length} negative language signal(s).`, 'deterministic_rule');

  for (const phrase of praiseMatches) f.add(`Positive language found: "${phrase}".`);
  for (const phrase of complaintMatches) f.add(`Negative language found: "${phrase}".`);

  const activeServices = client.services.filter((s) => s.active);
  const mentionedServices = activeServices.filter((s) => text.toLowerCase().includes(s.serviceName.toLowerCase())).map((s) => s.serviceName);
  for (const service of mentionedServices) f.add(`Mentions the client's known service: "${service}".`, 'client_knowledge');

  const activeAreas = client.serviceAreas.filter((a) => a.active);
  const mentionedLocations = activeAreas.filter((a) => text.toLowerCase().includes(a.name.toLowerCase())).map((a) => a.name);
  for (const area of mentionedLocations) f.add(`Mentions the client's known service area: "${area}".`, 'client_knowledge');

  const concerns: string[] = [];
  for (const phrase of complaintMatches) concerns.push(`Complaint language: "${phrase}"`);
  for (const phrase of actionMatches) {
    const desc = `Reviewer requests action: "${phrase}"`;
    concerns.push(desc);
    f.add(desc);
  }
  for (const phrase of urgencyMatches) {
    const desc = `Urgency indicator: "${phrase}"`;
    concerns.push(desc);
    f.add(desc);
  }

  let escalationNeeded = false;
  for (const [category, signals] of Object.entries(reviewPromptV1.ESCALATION_SIGNAL_CATEGORIES)) {
    const matches = findMatches(text, signals);
    if (matches.length > 0) {
      escalationNeeded = true;
      const label = ESCALATION_CATEGORY_LABELS[category] ?? category;
      const desc = `Possible escalation — ${label} (matched: "${matches[0]}").`;
      concerns.push(desc);
      f.add(desc, 'deterministic_rule');
    }
  }

  if (text.trim().split(/\s+/).length <= 3) {
    f.add('Review text is too short to extract meaningful detail beyond the star rating.', 'deterministic_rule');
  }

  return {
    rating: review.rating,
    classification,
    positivePoints: praiseMatches,
    negativePoints: complaintMatches,
    mentionedServices,
    mentionedLocations,
    concerns,
    escalationNeeded,
    evidence: f.evidence,
  };
}
