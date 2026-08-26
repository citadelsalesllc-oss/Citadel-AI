import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prisma } from './prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledgeClientsDir = path.resolve(__dirname, '../../knowledge/clients');

/**
 * Seed files intentionally support ONLY the core Client fields. Per the
 * Phase 2 data-integrity rule, seed data must never invent business facts
 * — additional knowledge (services, brand profile, SEO profile, etc.) gets
 * added through the knowledge-management API as it becomes actually known,
 * not hardcoded here. See knowledge/clients/*.json for the "why" on each
 * seed file.
 */
interface SeedClientFile {
  slug: string;
  companyName: string;
  legalName?: string;
  industry?: string;
  description?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  timezone?: string;
}

const SEED_FILES = ['cda-septic-systems.json'];

async function seedClient(fileName: string): Promise<void> {
  const filePath = path.join(knowledgeClientsDir, fileName);
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw) as SeedClientFile;

  // `?? null` (not left as `undefined`) is deliberate: Prisma's `update`
  // treats an `undefined` field as "leave whatever is already there," which
  // would let stale/invented data from a previous seed run silently survive
  // a re-seed that removed it from the source file. Re-seeding must fully
  // replace the record with exactly what's in the file — nothing more.
  const fields = {
    companyName: data.companyName,
    legalName: data.legalName ?? null,
    industry: data.industry ?? null,
    description: data.description ?? null,
    website: data.website ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    address: data.address ?? null,
    city: data.city ?? null,
    state: data.state ?? null,
    zip: data.zip ?? null,
    timezone: data.timezone ?? null,
  };

  await prisma.client.upsert({
    where: { slug: data.slug },
    create: { slug: data.slug, ...fields },
    update: fields,
  });

  console.log(`Seeded client: ${data.companyName} (${data.slug})`);
}

async function main(): Promise<void> {
  for (const file of SEED_FILES) {
    await seedClient(file);
  }
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
