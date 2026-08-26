import type { BrandProfile, UpdateBrandProfileInput } from '@citadel/shared';
import { prisma } from '../prisma.js';
import { toBrandProfile } from '../mappers.js';

export const brandProfileRepository = {
  async getByClient(clientId: string): Promise<BrandProfile | null> {
    const row = await prisma.brandProfile.findUnique({ where: { clientId } });
    return row ? toBrandProfile(row) : null;
  },

  /** One profile per client — creates it on first write, otherwise merges fields in. */
  async upsert(clientId: string, input: UpdateBrandProfileInput): Promise<BrandProfile> {
    const row = await prisma.brandProfile.upsert({
      where: { clientId },
      create: {
        clientId,
        brandVoice: input.brandVoice,
        tone: input.tone,
        preferredPhrases: input.preferredPhrases ?? [],
        forbiddenPhrases: input.forbiddenPhrases ?? [],
        writingStyle: input.writingStyle,
        emojiPolicy: input.emojiPolicy,
        capitalizationPreferences: input.capitalizationPreferences,
        ctaPreferences: input.ctaPreferences,
        otherRules: input.otherRules ?? [],
      },
      update: {
        brandVoice: input.brandVoice,
        tone: input.tone,
        preferredPhrases: input.preferredPhrases,
        forbiddenPhrases: input.forbiddenPhrases,
        writingStyle: input.writingStyle,
        emojiPolicy: input.emojiPolicy,
        capitalizationPreferences: input.capitalizationPreferences,
        ctaPreferences: input.ctaPreferences,
        otherRules: input.otherRules,
      },
    });
    return toBrandProfile(row);
  },
};
