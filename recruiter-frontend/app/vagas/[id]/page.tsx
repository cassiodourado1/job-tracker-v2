import { notFound } from "next/navigation";
import { AnswerPanel } from "@/features/answers";
import { PrepPanel, getInterviewPrep } from "@/features/interview-prep";
import { FitPanel, getStoredJobFit } from "@/features/job-fit";
import { ApiError } from "@/features/jobs/api";
import { ApplyBar, JobDetail, getJob, listSavedJobs } from "@/features/jobs";
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
  const [tailored, prep, fit, saved] = profile
    ? await Promise.all([
        getTailoredVersion(profile.id, job.id),
        getInterviewPrep(profile.id, job.id),
        getStoredJobFit(profile.id, job.id),
        listSavedJobs(profile.id),
      ])
    : [null, null, null, []];
  // A candidatura ativa vem da lista de salvas, que já traz o par vaga e
  // candidatura numa consulta só.
  const application =
    saved.find((item) => item.jobId === job.id)?.application ?? null;

  return (
    <div className="flex w-full flex-col gap-6">
      <JobDetail job={job} />
      {/* As perguntas usam o currículo do perfil: sem perfil escolhido, o
          gate do layout já mostra o seletor por cima. */}
      {profile && (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <ApplyBar
            profileId={profile.id}
            jobId={job.id}
            application={application}
          />
          <FitPanel profileId={profile.id} jobId={job.id} initial={fit} />
          <TailorPanel
            profileId={profile.id}
            jobId={job.id}
            initialVersion={tailored}
          />
          <PrepPanel profileId={profile.id} jobId={job.id} initial={prep} />
          <AnswerPanel profileId={profile.id} jobId={job.id} />
        </div>
      )}
    </div>
  );
}
