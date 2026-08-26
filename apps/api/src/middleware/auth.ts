import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../env.js';

/**
 * Minimal bearer-token gate. When API_AUTH_TOKEN is unset (local dev
 * default), requests pass through unauthenticated — this is a development
 * convenience, not a production posture; set API_AUTH_TOKEN before exposing
 * the API beyond localhost. See SECURITY.md.
 */
export function createAuthMiddleware(env: Env) {
  return function auth(req: Request, res: Response, next: NextFunction): void {
    if (!env.API_AUTH_TOKEN) {
      next();
      return;
    }
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (token !== env.API_AUTH_TOKEN) {
      res.status(401).json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }
    next();
  };
}
