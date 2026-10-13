import Link from "next/link";
import { notFound } from "next/navigation";
import { emptyLinks } from "@recruit/shared";
import { getJob } from "@/features/jobs";
import { getProfileDetail } from "@/features/profile/api";
import { getSelectedProfile } from "@/features/profile/current-profile";
import { PrintButton, ResumeSheet } from "@/features/resume";
import { getTailoredContent } from "@/features/tailored-resume";

/**
 * O currículo adaptado para esta vaga, pronto para "Salvar como PDF".
 *
 * Mesma folha da impressão do currículo base: só o conteúdo muda. Nome e
 * contatos vêm do perfil, como lá — a versão salva não os guarda.
 */
export default async function CurriculoDaVagaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const selected = await getSelectedProfile();

  if (!selected) {
    return null;
  }

  const [profile, job, resume] = await Promise.all([
    getProfileDetail(selected.id),
    getJob(id),
    getTailoredContent(selected.id, id),
  ]);

  if (!resume) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold tracking-tight">
            Currículo para {job.title} — {job.company}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Escolha &quot;Salvar como PDF&quot; no destino da impressão.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/vagas/${id}`}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Voltar à vaga
          </Link>
          <PrintButton />
        </div>
      </header>

      {/* Fundo claro fixo, como na impressão do currículo base. */}
      <div className="rounded-xl border border-zinc-200 bg-white print:rounded-none print:border-0">
        <ResumeSheet
          name={profile.name}
          headline={profile.headline}
          email={profile.email}
          phone={profile.phone}
          location={profile.location}
          links={profile.links ?? emptyLinks}
          resume={resume}
        />
      </div>
    </div>
  );
}
