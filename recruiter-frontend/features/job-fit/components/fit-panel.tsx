"use client";

import { useState, useTransition } from "react";
import type { FitVerdict, GapSeverity, JobFit } from "@recruit/shared";
import { analyzeJobFitAction } from "@/features/job-fit/actions";

/**
 * Aderência entre esta vaga e o seu currículo, pelo Claude.
 *
 * Só roda no clique: cada análise é uma chamada paga. O que o modelo diz que
 * você tem vem com o trecho do currículo que prova; trecho que o servidor não
 * achou no currículo aparece marcado para você conferir.
 */
export function FitPanel({
  profileId,
  jobId,
}: {
  profileId: string;
  jobId: string;
}) {
  const [fit, setFit] = useState<JobFit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const analyze = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await analyzeJobFitAction(profileId, jobId);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setFit(outcome.fit);
    });
  };

  return (
    <section className="cine-glass flex flex-col gap-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Aderência ao seu currículo</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            O Claude compara a vaga com o seu currículo: o que você já mostra,
            o que falta e como contornar. Vai só a parte profissional do
            currículo, sem nome nem contatos.
          </p>
        </div>
        <button
          type="button"
          onClick={analyze}
          disabled={pending}
          className="cursor-pointer whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {pending ? "Analisando…" : fit ? "Analisar de novo" : "Analisar"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {fit && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span
              className={`self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT_TONE[fit.verdict]}`}
            >
              Aderência {VERDICT_LABEL[fit.verdict]}
            </span>
            <p className="text-sm">{fit.summary}</p>
          </div>

          {fit.strengths.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                O que você já mostra
              </h3>
              <ul className="flex flex-col gap-1.5">
                {fit.strengths.map((item) => (
                  <li key={item.requirement} className="text-sm">
                    <span className="font-medium">{item.requirement}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {" "}
                      — “{item.evidence}”
                    </span>
                    {!item.verified && (
                      <span
                        className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        title="O trecho citado não foi encontrado no seu currículo. Confira antes de usar este ponto."
                      >
                        confira
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fit.gaps.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                O que falta e como contornar
              </h3>
              <ul className="flex flex-col gap-2">
                {[...fit.gaps]
                  .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
                  .map((gap) => (
                    <li key={gap.requirement} className="flex flex-col gap-0.5 text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_TONE[gap.severity]}`}
                        >
                          {gap.severity}
                        </span>
                        <span className="font-medium">{gap.requirement}</span>
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {gap.howToAddress}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const VERDICT_LABEL: Record<FitVerdict, string> = {
  forte: "forte",
  boa: "boa",
  parcial: "parcial",
  fraca: "fraca",
};

const VERDICT_TONE: Record<FitVerdict, string> = {
  forte: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  boa: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  parcial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  fraca: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const SEVERITY_ORDER: Record<GapSeverity, number> = {
  bloqueia: 0,
  importante: 1,
  detalhe: 2,
};

const SEVERITY_TONE: Record<GapSeverity, string> = {
  bloqueia: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  importante: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  detalhe: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};
