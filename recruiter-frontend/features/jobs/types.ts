import type {
  DiscoveredJob,
  Job,
  JobSearchResult,
  JobVariant,
  SavedJob,
} from "@recruit/shared";

export type { DiscoveredJob, Job, JobSearchResult, JobVariant, SavedJob };

export type JobActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };
