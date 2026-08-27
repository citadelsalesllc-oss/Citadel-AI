-- CreateTable
CREATE TABLE "seo_audits" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seo_audits_clientId_url_createdAt_idx" ON "seo_audits"("clientId", "url", "createdAt");

-- AddForeignKey
ALTER TABLE "seo_audits" ADD CONSTRAINT "seo_audits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
