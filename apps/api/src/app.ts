import express, { type Express } from 'express';
import cors from 'cors';
import type { Env } from './env.js';
import type { Container } from './container.js';
import { actorMiddleware } from './middleware/actor.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';
import { clientsRouter } from './routes/clients.js';
import { orchestratorRouter } from './routes/orchestrator.js';
import { contentRouter } from './routes/content.js';
import { openClawRouter } from './routes/openclaw.js';
import { dashboardRouter } from './routes/dashboard.js';

export function createApp(env: Env, container: Container): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(actorMiddleware);
  app.use(createAuthMiddleware(env));

  app.use('/health', healthRouter());
  app.use('/clients', clientsRouter(container.orchestrator, container.toolRegistry, env.MODEL_PROVIDER));
  app.use('/orchestrator', orchestratorRouter(container.orchestrator));
  app.use('/content', contentRouter(container.toolRegistry));
  app.use('/openclaw', openClawRouter(container.openClawTools));
  app.use('/dashboard', dashboardRouter(container.toolRegistry, env));

  app.use(errorHandler);

  return app;
}
