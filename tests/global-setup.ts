import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TEST_DATABASE_URL } from './test-db-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePackageDir = path.resolve(__dirname, '../database');

/**
 * Runs once before the whole test run: applies migrations to the dedicated
 * test database (never the dev database) so integration tests always see
 * an up-to-date schema.
 */
export default function globalSetup(): void {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: databasePackageDir,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
