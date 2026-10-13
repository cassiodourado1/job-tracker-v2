import "server-only";
import {
  interviewPrepLookupSchema,
  savedInterviewPrepSchema,
} from "@recruit/shared";
import type { SavedInterviewPrep } from "@recruit/shared";
import { env } from "@/lib/env";

/** Revalida com o mesmo schema do Nest: o backend é sistema externo para o Next. */
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${env.API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body as { message?: string } | null;

    throw new Error(detail?.message ?? `Falha na API (${response.status})`);
  }

  return body;
}

export async function prepareInterview(
  profileId: string,
  jobId: string,
  context: string,
): Promise<SavedInterviewPrep> {
  return savedInterviewPrepSchema.parse(
    await request("/interview-prep", {
      method: "POST",
      body: JSON.stringify({
        profileId,
        jobId,
        ...(context.trim() ? { context: context.trim() } : {}),
      }),
    }),
  );
}

export async function getInterviewPrep(
  profileId: string,
  jobId: string,
): Promise<SavedInterviewPrep | null> {
  const query = new URLSearchParams({ profileId, jobId }).toString();
  const lookup = interviewPrepLookupSchema.parse(
    await request(`/interview-prep?${query}`),
  );

  return lookup.prep;
}
