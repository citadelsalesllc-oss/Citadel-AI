import { z } from 'zod';

const EnvSchema = z.object({
  DASHBOARD_PORT: z.coerce.number().int().positive().default(3001),
  /**
   * Where the dashboard's frontend JS should send its fetch() calls — the
   * apps/api process (see ARCHITECTURE.md "Command Center dashboard").
   * Cross-origin by design: apps/api already runs cors() globally, and this
   * app serves nothing but static files, so there is no server-to-server
   * call to make here.
   */
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(source);
}
