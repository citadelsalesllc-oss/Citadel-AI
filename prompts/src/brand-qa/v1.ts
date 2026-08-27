/**
 * Brand QA policy, v1.
 *
 * Not an LLM prompt: Brand QA is deliberately rule-based, not a second
 * model call (see agents/src/brand-qa/checks.ts and ARCHITECTURE.md "Brand
 * QA") — a second model is exactly as capable of missing an invented fact
 * as the first one, and non-deterministic QA would make "did this pass"
 * untestable. What belongs in a *prompt* directory for a deterministic
 * component is its policy: the thresholds and word/phrase lists that
 * govern its checks, kept out of application code and versioned exactly
 * like the content prompt, so tuning a threshold or phrase list doesn't
 * require touching checks.ts.
 */

export const POLICY_VERSION = 'brand-qa/v1';

/** Generic AI-cliché phrases flagged as a non-blocking style warning. */
export const AI_CLICHE_PHRASES = [
  "in today's fast-paced world",
  'in this day and age',
  'look no further',
  'unlock the power of',
  'elevate your',
  "whether you're a",
  'in conclusion',
  'game changer',
  'game-changer',
  'at the end of the day',
  'when it comes to',
];

/** A word (5+ letters, to skip common short words) appearing this many times or more in one post is flagged as repetitive. */
export const REPETITION_WARNING_THRESHOLD = 4;
export const REPETITION_MIN_WORD_LENGTH = 5;

/** Hashtag count above which a platform gets a "too many hashtags" warning, not a hard failure. */
export const HASHTAG_WARNING_THRESHOLD_BY_PLATFORM: Record<string, number> = {
  FACEBOOK: 3,
};

/** Phrases in a CTA that imply a channel the client must actually have on file. */
export const CTA_PHONE_SIGNALS = ['call', 'phone', 'dial'];
export const CTA_WEBSITE_SIGNALS = ['visit our website', 'visit us online', 'online at', 'check out our site'];
