import type { ClientContext } from '@citadel/shared';

export interface BrandQaIssue {
  code: string;
  message: string;
  /** blocking issues stop the workflow (content moves to REVISION_REQUIRED instead of DRAFT); warnings are surfaced but non-blocking. */
  severity: 'blocking' | 'warning';
}

const AI_CLICHE_PHRASES = [
  "in today's fast-paced world",
  'in this day and age',
  'look no further',
  'unlock the power of',
  'elevate your',
  'whether you\'re a',
  'in conclusion',
  'game changer',
  'game-changer',
  'at the end of the day',
  'when it comes to',
];

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function checkForbiddenPhrases(body: string, client: ClientContext): BrandQaIssue[] {
  const lowerBody = body.toLowerCase();
  const forbidden = client.brandProfile?.forbiddenPhrases ?? [];
  return forbidden
    .filter((phrase) => lowerBody.includes(phrase.toLowerCase()))
    .map((phrase) => ({
      code: 'FORBIDDEN_PHRASE',
      message: `Contains forbidden phrase: "${phrase}"`,
      severity: 'blocking' as const,
    }));
}

export function checkInventedPhoneNumbers(body: string, client: ClientContext): BrandQaIssue[] {
  const matches = body.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) ?? [];
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

export function checkInventedPrices(body: string, client: ClientContext): BrandQaIssue[] {
  const matches = body.match(/\$\s?\d+(\.\d{2})?/g) ?? [];
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

export function checkAiSoundingLanguage(body: string): BrandQaIssue[] {
  const lowerBody = body.toLowerCase();
  return AI_CLICHE_PHRASES.filter((phrase) => lowerBody.includes(phrase)).map((phrase) => ({
    code: 'AI_SOUNDING_LANGUAGE',
    message: `Contains a generic AI-sounding phrase: "${phrase}". Consider rewriting in the client's voice.`,
    severity: 'warning' as const,
  }));
}

export function checkNotEmpty(body: string): BrandQaIssue[] {
  if (body.trim().length === 0) {
    return [{ code: 'EMPTY_CONTENT', message: 'Generated content is empty.', severity: 'blocking' }];
  }
  return [];
}
