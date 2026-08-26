-- CreateEnum
CREATE TYPE "client_status" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "brandRules",
DROP COLUMN "competitors",
DROP COLUMN "faqs",
DROP COLUMN "locations",
DROP COLUMN "notes",
DROP COLUMN "offers",
DROP COLUMN "seoKeywords",
DROP COLUMN "serviceArea",
DROP COLUMN "services",
DROP COLUMN "targetCustomers",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "status" "client_status" NOT NULL DEFAULT 'PROSPECT',
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "zip" TEXT;

-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "campaign" TEXT,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_areas" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_profiles" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "brandVoice" TEXT,
    "tone" TEXT,
    "preferredPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "forbiddenPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "writingStyle" TEXT,
    "emojiPolicy" TEXT,
    "capitalizationPreferences" TEXT,
    "ctaPreferences" TEXT,
    "otherRules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_audiences" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "primaryCustomer" TEXT,
    "secondaryCustomers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customerProblems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "buyingMotivations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "objections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "geographicTargeting" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_profiles" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "primaryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secondaryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priorityServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchIntent" TEXT,
    "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seoNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "offerName" TEXT NOT NULL,
    "description" TEXT,
    "cta" TEXT,
    "restrictions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_notes" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "category" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "services_clientId_idx" ON "services"("clientId");

-- CreateIndex
CREATE INDEX "service_areas_clientId_idx" ON "service_areas"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profiles_clientId_key" ON "brand_profiles"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "target_audiences_clientId_key" ON "target_audiences"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "seo_profiles_clientId_key" ON "seo_profiles"("clientId");

-- CreateIndex
CREATE INDEX "offers_clientId_idx" ON "offers"("clientId");

-- CreateIndex
CREATE INDEX "faqs_clientId_idx" ON "faqs"("clientId");

-- CreateIndex
CREATE INDEX "marketing_notes_clientId_idx" ON "marketing_notes"("clientId");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_audiences" ADD CONSTRAINT "target_audiences_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seo_profiles" ADD CONSTRAINT "seo_profiles_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_notes" ADD CONSTRAINT "marketing_notes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

