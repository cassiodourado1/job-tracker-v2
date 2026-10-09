"use client";

import { useActionState, useEffect } from "react";
import { IconUpload } from "@/components/icons";
import {
  importLinkedInAction,
  type ImportState,
} from "@/features/profile/actions";
import type { ImportOutcome } from "@/features/profile/linkedin-import";

const idle: ImportState = { status: "idle" };

/**
 * O import preenche o formulário para revisão — não grava. Só o botão salvar
 * escreve no banco.
 */
export function LinkedInImportCard({
  onImported,
}: {
  onImported: (outcome: ImportOutcome) => void;
}) {
  const [state, formAction, pending] = useActionState(
    importLinkedInAction,
    idle,
  );

  useEffect(() => {
    if (state.status === "success") {
      onImported(state.outcome);
    }
  }, [state, onImported]);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Importar do LinkedIn</h2>
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          No LinkedIn: <strong>Configurações → Privacidade dos dados → Baixe
          seus dados</strong> e escolha a <strong>primeira opção</strong>, o
          arquivo de dados maior. O pacote menor, só com “Perfil”, não traz
          cargos, formação nem competências. O LinkedIn manda o .zip por email
          (pode levar até um dia). Ele é lido aqui e descartado — nada é
          enviado para fora nem salvo em disco, e o formulário abaixo é
          preenchido para você revisar antes de gravar.
        </p>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept=".zip,application/zip"
          required
          className="flex-1 cursor-pointer rounded-lg border border-zinc-300 px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm dark:border-zinc-700 dark:file:bg-zinc-800 dark:file:text-zinc-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <IconUpload />
          {pending ? "Lendo…" : "Importar"}
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
            {Object.entries(state.outcome.counts)
              .filter(([, count]) => count > 0)
              .map(([label, count]) => `${count} ${label}`)
              .join(" · ") || "nenhum item"}
            . Revise abaixo e salve.
          </p>
          {state.outcome.missing.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Sem dados no ZIP para: {state.outcome.missing.join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
