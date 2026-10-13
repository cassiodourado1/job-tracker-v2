import "server-only";
import {
  resumeSchema,
  tailoredResumeSchema,
  tailoredVersionLookupSchema,
  tailoredVersionSchema,
} from "@recruit/shared";
import type {
  Resume,
  TailoredResume,
  TailoredVersion,
} from "@recruit/shared";
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

function query(profileId: string, jobId: string): string {
  return new URLSearchParams({ profileId, jobId }).toString();
}

export async function tailorResume(
  profileId: string,
  jobId: string,
): Promise<TailoredResume> {
  return tailoredResumeSchema.parse(
    await request("/tailored-resume", {
      method: "POST",
      body: JSON.stringify({ profileId, jobId }),
    }),
  );
}

export async function saveTailoredResume(
  profileId: string,
  jobId: string,
  resume: Resume,
): Promise<TailoredVersion> {
  return tailoredVersionSchema.parse(
    await request("/tailored-resume/save", {
      method: "POST",
      body: JSON.stringify({ profileId, jobId, resume }),
    }),
  );
}

export async function getTailoredVersion(
  profileId: string,
  jobId: string,
): Promise<TailoredVersion | null> {
  const lookup = tailoredVersionLookupSchema.parse(
    await request(`/tailored-resume?${query(profileId, jobId)}`),
  );

  return lookup.version;
}

/** `null` quando ainda não há versão salva para esta vaga. */
export async function getTailoredContent(
  profileId: string,
  jobId: string,
): Promise<Resume | null> {
  const response = await fetch(
    `${env.API_URL}/tailored-resume/content?${query(profileId, jobId)}`,
    { cache: "no-store" },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Falha na API (${response.status})`);
  }

  return resumeSchema.parse(await response.json());
}
