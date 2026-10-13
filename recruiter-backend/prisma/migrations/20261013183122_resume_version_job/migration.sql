-- AlterTable
ALTER TABLE "ResumeVersion" ADD COLUMN     "jobId" TEXT;

-- CreateIndex
CREATE INDEX "ResumeVersion_profileId_jobId_createdAt_idx" ON "ResumeVersion"("profileId", "jobId", "createdAt");

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
