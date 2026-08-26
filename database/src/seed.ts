import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prisma } from './prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const knowledgeClientsDir = path.resolve(__dirname, '../../knowledge/clients');

interface SeedClientFile {
  slug: string;
  companyName: string;
  description?: string;
  industry?: string;
  serviceArea?: string[];
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  services?: unknown;
  targetCustomers?: string[];
  brandRules?: unknown;
  offers?: unknown;
  competitors?: unknown;
  seoKeywords?: string[];
  locations?: string[];
  faqs?: unknown;
  notes?: string[];
}

const SEED_FILES = ['cda-septic-systems.json'];

async function seedClient(fileName: string): Promise<void> {
  const filePath = path.join(knowledgeClientsDir, fileName);
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw) as SeedClientFile;

  await prisma.client.upsert({
    where: { slug: data.slug },
    create: {
      slug: data.slug,
      companyName: data.companyName,
      description: data.description,
      industry: data.industry,
      serviceArea: data.serviceArea ?? [],
      address: data.address,
      phone: data.phone,
      email: data.email,
      website: data.website,
      services: (data.services as never) ?? [],
      targetCustomers: data.targetCustomers ?? [],
      brandRules: (data.brandRules as never) ?? { forbiddenPhrases: [], preferredPhrases: [], styleNotes: [] },
      offers: (data.offers as never) ?? [],
      competitors: (data.competitors as never) ?? [],
      seoKeywords: data.seoKeywords ?? [],
      locations: data.locations ?? [],
      faqs: (data.faqs as never) ?? [],
      notes: data.notes ?? [],
    },
    update: {
      companyName: data.companyName,
      description: data.description,
      industry: data.industry,
      serviceArea: data.serviceArea ?? [],
      address: data.address,
      phone: data.phone,
      email: data.email,
      website: data.website,
      services: (data.services as never) ?? [],
      targetCustomers: data.targetCustomers ?? [],
      brandRules: (data.brandRules as never) ?? { forbiddenPhrases: [], preferredPhrases: [], styleNotes: [] },
      offers: (data.offers as never) ?? [],
      competitors: (data.competitors as never) ?? [],
      seoKeywords: data.seoKeywords ?? [],
      locations: data.locations ?? [],
      faqs: (data.faqs as never) ?? [],
      notes: data.notes ?? [],
    },
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
