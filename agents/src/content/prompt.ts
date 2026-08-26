import type { ClientProfile } from '@citadel/shared';
import type { ContentPlatform } from './types.js';

const PLATFORM_STYLE_NOTES: Record<ContentPlatform, string> = {
  facebook: 'Facebook post: conversational, 1-3 short paragraphs, plain language, no more than ~150 words unless the client brand rules say otherwise.',
  instagram: 'Instagram caption: engaging opening line, short, may use line breaks; hashtags only if the client brand rules mention hashtag use.',
  google_business: 'Google Business Profile post: concise, factual, includes a clear call to action, no more than ~1500 characters, no hashtags.',
  blog: 'Blog post: structured with a clear opening, informative body, and closing call to action.',
  website: 'Website copy: clear, benefit-led, scannable.',
  email: 'Marketing email: clear subject-appropriate opening, concise body, one clear call to action.',
};

export function buildContentSystemPrompt(client: ClientProfile, platform: ContentPlatform): string {
  const rules = client.brandRules;
  const lines = [
    `You are the Citadel AI Content Agent writing on behalf of "${client.companyName}", a ${client.industry ?? 'local'} business.`,
    'You must only use facts provided below. Never invent phone numbers, prices, addresses, services, statistics, reviews, or claims that are not explicitly given to you.',
    'If you would need a fact that is not provided, omit it rather than making it up.',
    rules.voiceDescription ? `Brand voice: ${rules.voiceDescription}` : undefined,
    rules.tone ? `Tone: ${rules.tone}` : undefined,
    rules.forbiddenPhrases.length
      ? `Never use these words/phrases: ${rules.forbiddenPhrases.join(', ')}.`
      : undefined,
    rules.preferredPhrases.length
      ? `Prefer these phrases where natural: ${rules.preferredPhrases.join(', ')}.`
      : undefined,
    rules.styleNotes.length ? `Style notes: ${rules.styleNotes.join(' ')}` : undefined,
    `Format guidance: ${PLATFORM_STYLE_NOTES[platform]}`,
    'Avoid generic AI-sounding filler like "in today\'s fast-paced world" or "look no further". Write like a real local business owner.',
    'Output only the finished content body — no preamble, no explanation, no markdown headers.',
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

export function buildContentUserMessage(
  client: ClientProfile,
  platform: ContentPlatform,
  instruction: string,
): string {
  const lines: string[] = [`Instruction: ${instruction}`, '', 'Client facts (use ONLY these; do not invent anything else):', `Company: ${client.companyName}`];

  if (client.serviceArea.length) lines.push(`Service area: ${client.serviceArea.join('; ')}`);
  if (client.services.length) {
    lines.push(`Services: ${client.services.map((s) => (s.description ? `${s.name} - ${s.description}` : s.name)).join('; ')}`);
  }
  if (client.phone) lines.push(`Phone: ${client.phone}`);
  if (client.website) lines.push(`Website: ${client.website}`);
  if (client.offers.length) {
    lines.push(`Offers: ${client.offers.map((o) => (o.description ? `${o.name} - ${o.description}` : o.name)).join('; ')}`);
  }
  if (client.brandRules.preferredPhrases.length) {
    lines.push(`Preferred phrases: ${client.brandRules.preferredPhrases.join('; ')}`);
  }
  if (client.brandRules.forbiddenPhrases.length) {
    lines.push(`Forbidden phrases (never use): ${client.brandRules.forbiddenPhrases.join('; ')}`);
  }

  lines.push('', `Platform: ${platform}`);

  return lines.join('\n');
}
