import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { CitadelError } from '@citadel/shared';

const STATUS_BY_CODE: Record<string, number> = {
  CLIENT_NOT_FOUND: 404,
  CLIENT_NOT_ACTIVE: 422,
  RESOURCE_NOT_FOUND: 404,
  DUPLICATE_RECORD: 409,
  MISSING_INFORMATION: 422,
  NOT_CONFIGURED: 501,
  NOT_IMPLEMENTED: 501,
  VALIDATION_ERROR: 400,
  INVALID_LIFECYCLE_TRANSITION: 409,
  // The model provider (or its response) failed — the caller's request was
  // fine, an upstream dependency wasn't. 502, not 500.
  MODEL_PROVIDER_ERROR: 502,
  MALFORMED_MODEL_RESPONSE: 502,
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
    res.status(status).json({ error: { message: err.message, code: err.code } });
    return;
  }

  // Safety net: every route resolves the client first, so a foreign-key
  // violation on a child-record write shouldn't be reachable in practice —
  // but if it ever is, report it as an invalid relationship, not a 500.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
    res.status(400).json({
      error: { message: 'Invalid relationship: the referenced client does not exist', code: 'INVALID_RELATIONSHIP' },
    });
    return;
  }

  console.error(`[${req.requestId ?? 'unknown'}] Unhandled error:`, err);
  res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
}
