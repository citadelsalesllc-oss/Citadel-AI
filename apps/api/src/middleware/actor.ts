import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { RequestActor } from '@citadel/shared';

declare module 'express-serve-static-core' {
  interface Request {
    actor: RequestActor;
    requestId: string;
  }
}

/**
 * Resolves the acting identity for audit logging. There is no user account
 * system yet (see SECURITY.md "Authentication-ready architecture") — callers
 * identify themselves via headers, defaulting to an anonymous API caller.
 * This is a placeholder seam for real authentication, not authentication
 * itself.
 */
export function actorMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const id = req.header('x-actor-id') || 'anonymous';
  const label = req.header('x-actor-label') || 'API caller';
  req.actor = { id, label };
  req.requestId = req.header('x-request-id') || randomUUID();
  next();
}
