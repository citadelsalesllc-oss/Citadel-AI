import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { CitadelError } from '@citadel/shared';

const STATUS_BY_CODE: Record<string, number> = {
  CLIENT_NOT_FOUND: 404,
  MISSING_INFORMATION: 422,
  NOT_CONFIGURED: 501,
  NOT_IMPLEMENTED: 501,
  VALIDATION_ERROR: 400,
  BRAND_QA_FAILED: 422,
  INVALID_LIFECYCLE_TRANSITION: 409,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { message: 'Invalid request', code: 'VALIDATION_ERROR', details: err.issues },
    });
    return;
  }

  if (err instanceof CitadelError) {
    const status = STATUS_BY_CODE[err.code] ?? 400;
    const body: Record<string, unknown> = { error: { message: err.message, code: err.code } };
    if (err.code === 'BRAND_QA_FAILED' && 'issues' in err) {
      body.error = { ...(body.error as object), issues: (err as { issues: unknown }).issues };
    }
    res.status(status).json(body);
    return;
  }

  console.error(`[${req.requestId ?? 'unknown'}] Unhandled error:`, err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
}
