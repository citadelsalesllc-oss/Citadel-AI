-- CreateEnum
CREATE TYPE "review_source" AS ENUM ('GOOGLE_BUSINESS', 'MOCK', 'MANUAL');

-- CreateEnum
CREATE TYPE "review_response_status" AS ENUM ('UNRESPONDED', 'DRAFT', 'APPROVED', 'PUBLISHED', 'REJECTED', 'REVISION_REQUIRED');

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" "review_source" NOT NULL,
    "reviewerName" TEXT,
    "rating" INTEGER NOT NULL,
    "reviewText" TEXT NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "responseStatus" "review_response_status" NOT NULL DEFAULT 'UNRESPONDED',
    "responseText" TEXT,
    "responseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_response_versions" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "tone" TEXT,
    "cta" TEXT,
    "qaPassed" BOOLEAN NOT NULL,
    "qaIssues" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_response_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_clientId_responseStatus_idx" ON "reviews"("clientId", "responseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_clientId_source_externalId_key" ON "reviews"("clientId", "source", "externalId");

-- CreateIndex
CREATE INDEX "review_response_versions_reviewId_createdAt_idx" ON "review_response_versions"("reviewId", "createdAt");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_response_versions" ADD CONSTRAINT "review_response_versions_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
