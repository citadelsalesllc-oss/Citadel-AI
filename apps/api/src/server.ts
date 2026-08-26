import { loadEnv } from './env.js';
import { buildContainer } from './container.js';
import { createApp } from './app.js';

const env = loadEnv();

if (env.MODEL_PROVIDER === 'mock' && env.NODE_ENV !== 'test') {
  console.warn(
    '[citadel-ai] MODEL_PROVIDER=mock — using deterministic mock content generation. Set MODEL_PROVIDER=anthropic and ANTHROPIC_API_KEY for real Claude-generated content.',
  );
}
if (env.PUBLISH_PROVIDER === 'mock') {
  console.warn('[citadel-ai] PUBLISH_PROVIDER=mock — publish_content will simulate publishing and never contact a real social account.');
}

const container = buildContainer(env);
const app = createApp(env, container);

app.listen(env.PORT, () => {
  console.log(`[citadel-ai] API listening on port ${env.PORT} (env: ${env.NODE_ENV})`);
});
