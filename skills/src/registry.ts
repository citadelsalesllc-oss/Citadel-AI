import { SkillRegistry } from '@citadel/shared';
import { createCreateSocialPostSkill, type CreateSocialPostDeps } from './create-social-post/index.js';
import { createSeoAuditSkill, type SeoAuditDeps } from './seo-audit/index.js';

export type DefaultSkillRegistryDeps = CreateSocialPostDeps & SeoAuditDeps;

export function createDefaultSkillRegistry(deps: DefaultSkillRegistryDeps): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register(createCreateSocialPostSkill(deps));
  registry.register(createSeoAuditSkill(deps));
  return registry;
}
