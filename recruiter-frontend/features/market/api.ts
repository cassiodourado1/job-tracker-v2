import "server-only";
import { jobsDashboardSchema } from "@recruit/shared";
import type { DashboardWindow, JobsDashboard } from "@recruit/shared";
import { env } from "@/lib/env";

/** Revalida com o mesmo schema do Nest: o backend é sistema externo para o Next. */
export async function getJobsDashboard(
  profileId: string,
  window: DashboardWindow,
): Promise<JobsDashboard> {
  const query = new URLSearchParams({ profileId, window }).toString();
  const response = await fetch(`${env.API_URL}/jobs/dashboard?${query}`, {
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body as { message?: string } | null;

    throw new Error(detail?.message ?? `Falha na API (${response.status})`);
  }

  return jobsDashboardSchema.parse(body);
}
