import "server-only";
import { jobFitSchema } from "@recruit/shared";
import type { JobFit } from "@recruit/shared";
import { env } from "@/lib/env";

/** Revalida com o mesmo schema do Nest: o backend é sistema externo para o Next. */
export async function analyzeJobFit(
  profileId: string,
  jobId: string,
): Promise<JobFit> {
  const response = await fetch(`${env.API_URL}/job-fit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId, jobId }),
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body as { message?: string } | null;

    throw new Error(detail?.message ?? `Falha na análise (${response.status})`);
  }

  return jobFitSchema.parse(body);
}
