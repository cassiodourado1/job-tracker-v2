import "server-only";
import { storedJobFitSchema } from "@recruit/shared";
import type { StoredJobFit } from "@recruit/shared";
import { env } from "@/lib/env";

/** Revalida com o mesmo schema do Nest: o backend é sistema externo para o Next. */
export async function analyzeJobFit(
  profileId: string,
  jobId: string,
): Promise<StoredJobFit> {
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

  return storedJobFitSchema.parse(body);
}

/**
 * A última análise guardada, sem chamar o modelo. Falha aqui não derruba a
 * página: sem a análise guardada, o painel só volta a oferecer "Analisar".
 */
export async function getStoredJobFit(
  profileId: string,
  jobId: string,
): Promise<StoredJobFit | null> {
  const search = new URLSearchParams({ profileId, jobId });
  const response = await fetch(`${env.API_URL}/job-fit?${search.toString()}`, {
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const body: unknown = await response.json().catch(() => null);
  const parsed = storedJobFitSchema
    .nullable()
    .safeParse((body as { fit?: unknown } | null)?.fit);

  return parsed.success ? parsed.data : null;
}
