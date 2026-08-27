import { SkillRegistry } from '@citadel/shared';
import { createCreateSocialPostSkill, type CreateSocialPostDeps } from './create-social-post/index.js';
import { createSeoAuditSkill, type SeoAuditDeps } from './seo-audit/index.js';
import { createWebsiteAuditSkill, type WebsiteAuditDeps } from './website-audit/index.js';
import { createReviewAnalyzeSkill, type ReviewAnalyzeDeps } from './review-analyze/index.js';
import { createReviewRespondSkill, type ReviewRespondDeps } from './review-respond/index.js';

export type DefaultSkillRegistryDeps = CreateSocialPostDeps & SeoAuditDeps & WebsiteAuditDeps & ReviewAnalyzeDeps & ReviewRespondDeps;

export function createDefaultSkillRegistry(deps: DefaultSkillRegistryDeps): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register(createCreateSocialPostSkill(deps));
  registry.register(createSeoAuditSkill(deps));
  registry.register(createWebsiteAuditSkill(deps));
  registry.register(createReviewAnalyzeSkill(deps));
  registry.register(createReviewRespondSkill(deps));
  return registry;
}
