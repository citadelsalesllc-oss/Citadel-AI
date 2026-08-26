import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __citadelPrisma: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient. Reused across module reloads in dev/test to avoid
 * exhausting Postgres connections.
 */
export const prisma: PrismaClient = globalThis.__citadelPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__citadelPrisma = prisma;
}
