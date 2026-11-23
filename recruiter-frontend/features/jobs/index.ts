/** Superfície pública da feature. `api.ts` e `actions.ts` são internos. */
export { JobDiscovery } from "@/features/jobs/components/job-discovery";
export { SavedJobsList } from "@/features/jobs/components/saved-jobs-list";
export { JobDetail } from "@/features/jobs/components/job-detail";
export { ApplyBar } from "@/features/jobs/components/apply-bar";
export { discoverJobs, listSavedJobs, getJob } from "@/features/jobs/api";
export type { Job, JobSearchResult, SavedJob } from "@/features/jobs/types";
