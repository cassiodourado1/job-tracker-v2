"use server";

import type { SavedInterviewPrep } from "@recruit/shared";
import { prepareInterview } from "@/features/interview-prep/api";

export type PrepState =
  | { status: "ok"; saved: SavedInterviewPrep }
  | { status: "error"; message: string };

export async function prepareInterviewAction(
  profileId: string,
  jobId: string,
  context: string,
): Promise<PrepState> {
  try {
    return {
      status: "ok",
      saved: await prepareInterview(profileId, jobId, context),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Não consegui preparar a entrevista.",
    };
  }
}
