"use client";

import { useActionState, useEffect } from "react";
import type { ResumeImportResult } from "@recruit/shared";
import { IconUpload } from "@/components/icons";
import {
  importResumePdfAction,
  type ResumePdfState,
} from "@/features/profile/actions";

const idle: ResumePdfState = { status: "idle" };

/**
 * Importar o currículo de um PDF. Como o import do LinkedIn, preenche o
 * formulário para revisão — não grava; só o botão salvar escreve no banco.
 *
 * Diz com todas as letras o que vai para a IA e o que não vai: numa
 * ferramenta aberta, quem envia o currículo precisa saber disso antes.
 */
export function ResumePdfImportCard({
  profileId,
  onImported,
}: {
  profileId: string;
  onImported: (result: ResumeImportResult) => void;
}) {
  const [state, formAction, pending] = useActionState(
    importResumePdfAction.bind(null, profileId),
    idle,
  );

  useEffect(() => {
    if (state.status === "success") {
      onImported(state.result);
    }
  }, [state, onImported]);

  const counts =
    state.status === "success"
      ? [
          [state.result.resume.experiences.length, "experiências"],
          [state.result.resume.education.length, "formações"],
          [state.result.resume.skills.length, "skills"],
          [state.result.resume.languages.length, "idiomas"],
          [state.result.resume.certifications.length, "certificações"],
          [state.result.resume.projects.length, "projetos"],
        ].filter(([count]) => Number(count) > 0)
      : [];

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Importar currículo (PDF)</h2>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          O texto do PDF é lido aqui e organizado pelo Claude nas seções
          abaixo. <strong>Antes de ir para o Claude, saem nome, email,
          telefone, links e documentos</strong> — esses preenchem o perfil
          direto, sem passar pela IA. A cidade fica, para achar vagas locais.
          O arquivo não é salvo, e o formulário é preenchido para você revisar
          antes de gravar.
        </p>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept=".pdf,application/pdf"
          required
          className="flex-1 cursor-pointer rounded-lg border border-zinc-300 px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm dark:border-zinc-700 dark:file:bg-zinc-800 dark:file:text-zinc-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <IconUpload />
          {pending ? "Lendo o currículo…" : "Importar"}
        </button>
      </form>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-emerald-700 dark:text-emerald-400">
            Lido:{" "}
            {counts.map(([count, label]) => `${count} ${label}`).join(" · ") ||
              "nenhum item"}
            . Revise abaixo e salve.
          </p>
          {state.result.removed.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Não enviados ao Claude: {state.result.removed.join(", ")}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
