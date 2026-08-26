import { SkillRegistry } from '@citadel/shared';
import { createCreateSocialPostSkill, type CreateSocialPostDeps } from './create-social-post/index.js';

export function createDefaultSkillRegistry(deps: CreateSocialPostDeps): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register(createCreateSocialPostSkill(deps));
  return registry;
}
