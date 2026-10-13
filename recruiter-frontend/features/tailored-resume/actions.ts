"use server";

import type {
  Resume,
  TailoredResume,
  TailoredVersion,
} from "@recruit/shared";
import {
  saveTailoredResume,
  tailorResume,
} from "@/features/tailored-resume/api";

export type TailorState =
  | { status: "ok"; proposal: TailoredResume }
  | { status: "error"; message: string };

export async function tailorResumeAction(
  profileId: string,
  jobId: string,
): Promise<TailorState> {
  try {
    return { status: "ok", proposal: await tailorResume(profileId, jobId) };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Não consegui adaptar o currículo.",
    };
  }
}

export type SaveTailoredState =
  | { status: "ok"; version: TailoredVersion }
  | { status: "error"; message: string };

export async function saveTailoredResumeAction(
  profileId: string,
  jobId: string,
  resume: Resume,
): Promise<SaveTailoredState> {
  try {
    return {
      status: "ok",
      version: await saveTailoredResume(profileId, jobId, resume),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Não consegui salvar a versão.",
    };
  }
}
