-- CreateEnum
CREATE TYPE "FitVerdict" AS ENUM ('forte', 'boa', 'parcial', 'fraca');

-- CreateEnum
CREATE TYPE "FitOrigin" AS ENUM ('agente', 'tela');

-- CreateTable
CREATE TABLE "JobFitAnalysis" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "verdict" "FitVerdict" NOT NULL,
    "content" JSONB NOT NULL,
    "origin" "FitOrigin" NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFitAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobFitAnalysis_profileId_origin_analyzedAt_idx" ON "JobFitAnalysis"("profileId", "origin", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobFitAnalysis_profileId_jobId_key" ON "JobFitAnalysis"("profileId", "jobId");

-- AddForeignKey
ALTER TABLE "JobFitAnalysis" ADD CONSTRAINT "JobFitAnalysis_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFitAnalysis" ADD CONSTRAINT "JobFitAnalysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
