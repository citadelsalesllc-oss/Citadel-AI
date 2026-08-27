import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  MODEL_PROVIDER: z.enum(['mock', 'anthropic']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  MODEL_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  PUBLISH_PROVIDER: z.enum(['mock', 'facebook']).default('mock'),
  FACEBOOK_PAGE_ACCESS_TOKEN: z.string().optional(),
  REVIEW_PROVIDER: z.enum(['mock', 'google_business']).default('mock'),
  GOOGLE_BUSINESS_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_BUSINESS_LOCATION_ID: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_AUTH_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}
