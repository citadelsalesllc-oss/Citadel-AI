import { z } from 'zod';

/**
 * Shared by ContentVersion and ReviewResponseVersion (Phase 6): every
 * versioned artifact in the platform is either the model's own output or
 * a human's edit of it, and both version-history tables need to
 * distinguish which so the Command Center dashboard can show "AI-generated
 * or human-edited" per the master spec. One enum, not two, since the
 * concept is identical in both places.
 */
export const VersionSourceSchema = z.enum(['AI_GENERATED', 'HUMAN_EDIT']);
export type VersionSource = z.infer<typeof VersionSourceSchema>;
