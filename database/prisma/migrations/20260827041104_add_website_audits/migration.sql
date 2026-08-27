-- CreateTable
CREATE TABLE "website_audits" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_audits_clientId_url_createdAt_idx" ON "website_audits"("clientId", "url", "createdAt");

-- AddForeignKey
ALTER TABLE "website_audits" ADD CONSTRAINT "website_audits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
