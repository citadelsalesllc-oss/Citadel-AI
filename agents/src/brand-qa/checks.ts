import type { ClientContext } from '@citadel/shared';
import { brandQaPolicyV1 } from '@citadel/prompts';

export interface BrandQaIssue {
  code: string;
  message: string;
  /** blocking issues stop the workflow (content is saved as REVISION_REQUIRED instead of DRAFT); warnings are surfaced but non-blocking. */
  severity: 'blocking' | 'warning';
}

/** The slice of a Content Agent result Brand QA actually needs — see brand-qa-agent.ts. */
export interface GeneratedContentForQa {
  content: string;
  hashtags: string[];
  cta: string | null;
  platform: string;
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function checkNotEmpty(content: string): BrandQaIssue[] {
  if (content.trim().length === 0) {
    return [{ code: 'EMPTY_CONTENT', message: 'Generated content is empty.', severity: 'blocking' }];
  }
  return [];
}

export function checkForbiddenPhrases(content: string, client: ClientContext): BrandQaIssue[] {
  const lowerContent = content.toLowerCase();
  const forbidden = client.brandProfile?.forbiddenPhrases ?? [];
  return forbidden
    .filter((phrase) => lowerContent.includes(phrase.toLowerCase()))
    .map((phrase) => ({
      code: 'FORBIDDEN_PHRASE',
      message: `Contains forbidden phrase: "${phrase}"`,
      severity: 'blocking' as const,
    }));
}

/** Non-blocking nudge: only fires when the client actually has preferred phrases defined and none were used. */
export function checkPreferredPhrasesUsage(content: string, client: ClientContext): BrandQaIssue[] {
  const preferred = client.brandProfile?.preferredPhrases ?? [];
  if (preferred.length === 0) return [];
  const lowerContent = content.toLowerCase();
  const usedAny = preferred.some((phrase) => lowerContent.includes(phrase.toLowerCase()));
  if (usedAny) return [];
  return [
    {
      code: 'NO_PREFERRED_PHRASES_USED',
      message: `None of the client's preferred phrases (${preferred.join(', ')}) appear in this content.`,
      severity: 'warning',
    },
  ];
}

export function checkInventedPhoneNumbers(content: string, client: ClientContext): BrandQaIssue[] {
  const matches = content.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) ?? [];
  const clientDigits = client.core.phone ? normalizeDigits(client.core.phone) : null;
  const issues: BrandQaIssue[] = [];
  for (const match of matches) {
    const digits = normalizeDigits(match);
    if (!clientDigits || digits !== clientDigits) {
      issues.push({
        code: 'INVENTED_PHONE_NUMBER',
        message: `Contains a phone number ("${match}") that does not match the client's stored phone number.`,
        severity: 'blocking',
      });
    }
  }
  return issues;
}

export function checkInventedPrices(content: string, client: ClientContext): BrandQaIssue[] {
  const matches = content.match(/\$\s?\d+(\.\d{2})?/g) ?? [];
  if (matches.length === 0) return [];
  // Stringifying the whole context (core fields + services + offers + FAQs
  // + notes) is a deliberately broad net: any price the model wrote must
  // appear SOMEWHERE in what the client actually gave us, not just in the
  // one field most likely to hold it.
  const clientText = JSON.stringify(client);
  return matches
    .filter((price) => !clientText.includes(price.replace(/\s/g, '')))
    .map((price) => ({
      code: 'INVENTED_PRICE',
      message: `Contains a price ("${price}") not found anywhere in the client's stored profile.`,
      severity: 'blocking' as const,
    }));
}

/**
 * Best-effort detection of a "City, ST" style location the content
 * mentions but that isn't among the client's known service areas or
 * business address. Regex-based location matching is inherently
 * approximate (see ARCHITECTURE.md) — false positives are possible for an
 * unusual city name; false negatives (a location written without the
 * ", ST" pattern) are more likely, so this is a floor, not a guarantee.
 */
export function checkInventedLocations(content: string, client: ClientContext): BrandQaIssue[] {
  // The first word of a place name must be capitalized; a later word is
  // either also capitalized ("Post Falls") or a short lowercase connector
  // glued to the next capitalized word with an apostrophe ("d'Alene" in
  // "Coeur d'Alene") — anything else ends the candidate, so this doesn't
  // swallow ordinary lowercase prose leading up to an unrelated comma.
  const matches =
    content.match(/\b[A-Z][a-zA-Z]*(?:\s[A-Z][a-zA-Z.-]*|\s[a-z]{1,2}'[A-Z][a-zA-Z.-]*)*,\s*[A-Z]{2}\b/g) ?? [];
  if (matches.length === 0) return [];

  const known = new Set<string>();
  for (const area of client.serviceAreas) {
    if (area.city && area.state) known.add(`${area.city}, ${area.state}`.toLowerCase());
    known.add(area.name.toLowerCase());
  }
  if (client.core.city && client.core.state) {
    known.add(`${client.core.city}, ${client.core.state}`.toLowerCase());
  }

  return matches
    .filter((location) => !known.has(location.toLowerCase()))
    .map((location) => ({
      code: 'INVENTED_LOCATION',
      message: `Contains a location ("${location}") not found among the client's service areas or business address.`,
      severity: 'blocking' as const,
    }));
}

/** A CTA that implies a channel ("call us," "visit us online") the client doesn't have on file. */
export function checkCtaAccuracy(cta: string | null, client: ClientContext): BrandQaIssue[] {
  if (!cta) return [];
  const lowerCta = cta.toLowerCase();
  const issues: BrandQaIssue[] = [];

  const impliesPhone = brandQaPolicyV1.CTA_PHONE_SIGNALS.some((signal) => lowerCta.includes(signal));
  if (impliesPhone && !client.core.phone) {
    issues.push({
      code: 'CTA_UNSUPPORTED_PHONE',
      message: `The call to action ("${cta}") tells the reader to call, but no phone number is on file for this client.`,
      severity: 'blocking',
    });
  }

  const impliesWebsite = brandQaPolicyV1.CTA_WEBSITE_SIGNALS.some((signal) => lowerCta.includes(signal));
  if (impliesWebsite && !client.core.website) {
    issues.push({
      code: 'CTA_UNSUPPORTED_WEBSITE',
      message: `The call to action ("${cta}") directs the reader online, but no website is on file for this client.`,
      severity: 'blocking',
    });
  }

  return issues;
}

export function checkHashtagFormat(hashtags: string[], platform: string): BrandQaIssue[] {
  const issues: BrandQaIssue[] = [];
  for (const tag of hashtags) {
    if (!/^#?[A-Za-z0-9_]+$/.test(tag)) {
      issues.push({ code: 'MALFORMED_HASHTAG', message: `Malformed hashtag: "${tag}"`, severity: 'blocking' });
    }
  }

  const threshold = brandQaPolicyV1.HASHTAG_WARNING_THRESHOLD_BY_PLATFORM[platform.toUpperCase()];
  if (threshold !== undefined && hashtags.length > threshold) {
    issues.push({
      code: 'EXCESSIVE_HASHTAGS',
      message: `${hashtags.length} hashtags is more than typical for ${platform} (suggested max ${threshold}).`,
      severity: 'warning',
    });
  }

  return issues;
}

export function checkAiSoundingLanguage(content: string): BrandQaIssue[] {
  const lowerContent = content.toLowerCase();
  return brandQaPolicyV1.AI_CLICHE_PHRASES.filter((phrase) => lowerContent.includes(phrase)).map((phrase) => ({
    code: 'AI_SOUNDING_LANGUAGE',
    message: `Contains a generic AI-sounding phrase: "${phrase}". Consider rewriting in the client's voice.`,
    severity: 'warning' as const,
  }));
}

const STOPWORDS = new Set([
  'about', 'their', 'there', 'which', 'while', 'would', 'could', 'should',
  'where', 'these', 'those', 'today', 'right', 'every', 'always', 'never',
]);

/** Flags a word (5+ letters, common words excluded) that repeats an unusual number of times in one short post. */
export function checkExcessiveRepetition(content: string): BrandQaIssue[] {
  const words = content.toLowerCase().match(/\b[a-z']+\b/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) {
    if (word.length < brandQaPolicyV1.REPETITION_MIN_WORD_LENGTH || STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  const issues: BrandQaIssue[] = [];
  for (const [word, count] of counts) {
    if (count >= brandQaPolicyV1.REPETITION_WARNING_THRESHOLD) {
      issues.push({
        code: 'EXCESSIVE_REPETITION',
        message: `The word "${word}" appears ${count} times — consider varying the language.`,
        severity: 'warning',
      });
    }
  }
  return issues;
}
