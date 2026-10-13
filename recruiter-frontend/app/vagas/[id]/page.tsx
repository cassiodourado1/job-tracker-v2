import { notFound } from "next/navigation";
import { AnswerPanel } from "@/features/answers";
import { FitPanel } from "@/features/job-fit";
import { ApiError } from "@/features/jobs/api";
import { JobDetail, getJob } from "@/features/jobs";
import type { Job } from "@/features/jobs";
import { getSelectedProfile } from "@/features/profile/current-profile";
import { TailorPanel, getTailoredVersion } from "@/features/tailored-resume";

export default async function VagaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Só a busca fica no try; o JSX sai de fora, senão o try/catch viraria um
  // limite de erro acidental para tudo que a árvore renderizar abaixo.
  let job: Job;

  try {
    job = await getJob(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  const profile = await getSelectedProfile();
  const tailored = profile ? await getTailoredVersion(profile.id, job.id) : null;

  return (
    <div className="flex w-full flex-col gap-6">
      <JobDetail job={job} />
      {/* As perguntas usam o currículo do perfil: sem perfil escolhido, o
          gate do layout já mostra o seletor por cima. */}
      {profile && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <FitPanel profileId={profile.id} jobId={job.id} />
          <TailorPanel
            profileId={profile.id}
            jobId={job.id}
            initialVersion={tailored}
          />
          <AnswerPanel profileId={profile.id} jobId={job.id} />
        </div>
      )}
    </div>
  );
}
