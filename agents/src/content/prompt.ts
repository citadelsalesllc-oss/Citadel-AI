import type { ClientContext } from '@citadel/shared';
import type { ContentPlatform } from './types.js';

const PLATFORM_STYLE_NOTES: Record<ContentPlatform, string> = {
  facebook: 'Facebook post: conversational, 1-3 short paragraphs, plain language, no more than ~150 words unless the client brand rules say otherwise.',
  instagram: 'Instagram caption: engaging opening line, short, may use line breaks; hashtags only if the client brand rules mention hashtag use.',
  google_business: 'Google Business Profile post: concise, factual, includes a clear call to action, no more than ~1500 characters, no hashtags.',
  blog: 'Blog post: structured with a clear opening, informative body, and closing call to action.',
  website: 'Website copy: clear, benefit-led, scannable.',
  email: 'Marketing email: clear subject-appropriate opening, concise body, one clear call to action.',
};

export function buildContentSystemPrompt(context: ClientContext, platform: ContentPlatform): string {
  const brand = context.brandProfile;
  const lines = [
    `You are the Citadel AI Content Agent writing on behalf of "${context.core.companyName}", a ${context.core.industry ?? 'local'} business.`,
    'You must only use facts provided below. Never invent phone numbers, prices, addresses, services, statistics, reviews, or claims that are not explicitly given to you.',
    'If you would need a fact that is not provided, omit it rather than making it up.',
    brand?.brandVoice ? `Brand voice: ${brand.brandVoice}` : undefined,
    brand?.tone ? `Tone: ${brand.tone}` : undefined,
    brand?.writingStyle ? `Writing style: ${brand.writingStyle}` : undefined,
    brand?.emojiPolicy ? `Emoji policy: ${brand.emojiPolicy}` : undefined,
    brand?.capitalizationPreferences ? `Capitalization: ${brand.capitalizationPreferences}` : undefined,
    brand?.ctaPreferences ? `Call-to-action preference: ${brand.ctaPreferences}` : undefined,
    brand?.forbiddenPhrases.length
      ? `Never use these words/phrases: ${brand.forbiddenPhrases.join(', ')}.`
      : undefined,
    brand?.preferredPhrases.length
      ? `Prefer these phrases where natural: ${brand.preferredPhrases.join(', ')}.`
      : undefined,
    brand?.otherRules.length ? `Other brand rules: ${brand.otherRules.join(' ')}` : undefined,
    `Format guidance: ${PLATFORM_STYLE_NOTES[platform]}`,
    'Avoid generic AI-sounding filler like "in today\'s fast-paced world" or "look no further". Write like a real local business owner.',
    'Output only the finished content body — no preamble, no explanation, no markdown headers.',
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

export function buildContentUserMessage(
  context: ClientContext,
  platform: ContentPlatform,
  instruction: string,
): string {
  const { core, services, serviceAreas, offers, brandProfile } = context;
  const lines: string[] = [
    `Instruction: ${instruction}`,
    '',
    'Client facts (use ONLY these; do not invent anything else):',
    `Company: ${core.companyName}`,
  ];

  const activeAreas = serviceAreas.filter((a) => a.active);
  if (activeAreas.length) {
    lines.push(`Service area: ${activeAreas.map((a) => [a.name, a.city, a.state].filter(Boolean).join(', ')).join('; ')}`);
  }

  const activeServices = services.filter((s) => s.active);
  if (activeServices.length) {
    lines.push(
      `Services: ${activeServices.map((s) => (s.description ? `${s.serviceName} - ${s.description}` : s.serviceName)).join('; ')}`,
    );
  }

  if (core.phone) lines.push(`Phone: ${core.phone}`);
  if (core.website) lines.push(`Website: ${core.website}`);

  const activeOffers = offers.filter((o) => o.active);
  if (activeOffers.length) {
    lines.push(
      `Offers: ${activeOffers.map((o) => (o.description ? `${o.offerName} - ${o.description}` : o.offerName)).join('; ')}`,
    );
  }

  if (brandProfile?.preferredPhrases.length) {
    lines.push(`Preferred phrases: ${brandProfile.preferredPhrases.join('; ')}`);
  }
  if (brandProfile?.forbiddenPhrases.length) {
    lines.push(`Forbidden phrases (never use): ${brandProfile.forbiddenPhrases.join('; ')}`);
  }

  lines.push('', `Platform: ${platform}`);

  return lines.join('\n');
}
