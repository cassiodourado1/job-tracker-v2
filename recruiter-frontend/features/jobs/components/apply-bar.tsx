"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { applyToJobAction } from "@/features/jobs/actions";

/**
 * "Já me candidatei" também na página da vaga, e não só no card: é aqui que
 * você lê a análise e baixa o currículo adaptado, então é daqui que sai para
 * enviar. Sem o botão, a candidatura enviada não ficava registrada no app.
 */
export function ApplyBar({
  profileId,
  jobId,
  application,
}: {
  profileId: string;
  jobId: string;
  application: { id: string; status: string } | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (application) {
    return (
      <section className="cine-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <span className="text-sm">
          Você se candidatou a esta vaga. Status:{" "}
          <span className="font-semibold">{application.status}</span>.
        </span>
        <Link
          href="/candidaturas"
          className="whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Acompanhar candidatura
        </Link>
      </section>
    );
  }

  return (
    <section className="cine-glass flex flex-col gap-2 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-zinc-600 dark:text-zinc-300">
          Enviou no site da empresa? Registre aqui para acompanhar.
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const outcome = await applyToJobAction(profileId, jobId);

              if (outcome.status === "error") {
                setError(outcome.message);
              }
            })
          }
          className="cursor-pointer whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "Registrando…" : "Já me candidatei"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
