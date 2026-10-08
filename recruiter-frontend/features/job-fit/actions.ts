"use server";

import type { JobFit } from "@recruit/shared";
import { analyzeJobFit } from "@/features/job-fit/api";

export type JobFitState =
  | { status: "ok"; fit: JobFit }
  | { status: "error"; message: string };

export async function analyzeJobFitAction(
  profileId: string,
  jobId: string,
): Promise<JobFitState> {
  try {
    return { status: "ok", fit: await analyzeJobFit(profileId, jobId) };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Não consegui analisar a vaga.",
    };
  }
}
