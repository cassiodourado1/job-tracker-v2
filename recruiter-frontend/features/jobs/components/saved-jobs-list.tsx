"use client";

import Link from "next/link";
import { Tilt } from "@/components/motion";
import { useState, useTransition } from "react";
import { IconExternalLink, IconTrash } from "@/components/icons";
import {
  applyToJobAction,
  fillFormAction,
  unsaveJobAction,
  type FillState,
} from "@/features/jobs/actions";
import { JobsTabs } from "@/features/jobs/components/jobs-tabs";
import {
  JobTags,
  StackTags,
  formatSalary,
} from "@/features/jobs/components/job-meta";
import type { SavedJob } from "@/features/jobs/types";
import { openableJobUrl } from "@recruit/shared";
import { safeExternalUrl } from "@/lib/safe-url";
import { VERDICT_LABEL, VERDICT_TONE } from "@/features/job-fit/components/verdict";
import type { FitVerdict } from "@recruit/shared";

interface SavedJobsListProps {
  profileId: string;
  saved: SavedJob[];
}

/**
 * Recortes da lista. "Seleção do agente" é o que o agente diário encontrou
 * (por padrão sem IA) ou analisou, e você ainda não enviou: é a fila do dia,
 * e por isso sai quando você marca "Já me candidatei".
 */
type View = "agente" | "pendentes" | "candidatadas" | "todas";

const VIEWS: { id: View; label: string; empty: string }[] = [
  {
    id: "agente",
    label: "Seleção do agente",
    empty:
      "Nada na seleção do agente. Ele procura vagas novas todo dia às 9h, sem IA.",
  },
  {
    id: "pendentes",
    label: "Para enviar",
    empty: "Nenhuma vaga salva esperando candidatura.",
  },
  {
    id: "candidatadas",
    label: "Já me candidatei",
    empty: "Nenhuma candidatura registrada a partir das vagas salvas.",
  },
  { id: "todas", label: "Todas", empty: "Nenhuma vaga salva ainda." },
];

const VERDICT_ORDER: Record<FitVerdict, number> = {
  forte: 0,
  boa: 1,
  parcial: 2,
  fraca: 3,
};

function inView(item: SavedJob, view: View): boolean {
  switch (view) {
    case "agente":
      return (
        (item.origin === "agente" || item.fit?.origin === "agente") &&
        !item.application
      );
    case "pendentes":
      return !item.application;
    case "candidatadas":
      return Boolean(item.application);
    case "todas":
      return true;
  }
}

/**
 * Na seleção do agente, as analisadas primeiro, da melhor aderência para a
 * pior (no empate, a análise mais recente): é a ordem em que vale a pena
 * enviar. Depois, as encontradas sem IA, na ordem em que o agente salvou.
 * Nos outros recortes, a ordem de quando você salvou, como sempre foi.
 */
function ordered(items: SavedJob[], view: View): SavedJob[] {
  if (view !== "agente") {
    return items;
  }

  const rank = (item: SavedJob) =>
    item.fit ? VERDICT_ORDER[item.fit.verdict] : Object.keys(VERDICT_ORDER).length;

  // sort é estável: entre as sem análise, fica a ordem de salvamento.
  return [...items].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.fit && b.fit ? b.fit.analyzedAt.localeCompare(a.fit.analyzedAt) : 0),
  );
}

export function SavedJobsList({ profileId, saved }: SavedJobsListProps) {
  const hasAgentPicks = saved.some((item) => inView(item, "agente"));
  const [view, setView] = useState<View>(hasAgentPicks ? "agente" : "todas");
  const visible = ordered(
    saved.filter((item) => inView(item, view)),
    view,
  );
  const current = VIEWS.find((entry) => entry.id === view)!;

  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-4">
      <JobsTabs savedCount={saved.length} />

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Vagas que você guardou. Continuam aqui depois de aplicadas.
      </p>

      {saved.length > 0 && (
        <div
          role="group"
          aria-label="Recorte das vagas salvas"
          className="flex flex-wrap gap-2"
        >
          {VIEWS.map((entry) => {
            const count = saved.filter((item) => inView(item, entry.id)).length;
            const active = entry.id === view;

            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                onClick={() => setView(entry.id)}
                className={`cursor-pointer whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                }`}
              >
                {entry.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {saved.length > 0 && visible.length === 0 ? (
        <div className="cine-glass rounded-2xl px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {current.empty}
        </div>
      ) : saved.length === 0 ? (
        <div className="cine-glass flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nenhuma vaga salva ainda.
          </p>
          <Link
            href="/vagas"
            className="text-sm font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
          >
            Buscar vagas
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item, index) => (
            <SavedCard
              key={item.jobId}
              index={index}
              profileId={profileId}
              item={item}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SavedCard({
  index,
  profileId,
  item,
}: {
  index: number;
  profileId: string;
  item: SavedJob;
}) {
  const { job, application, fit, tailored, origin, savedAt } = item;
  const [error, setError] = useState<string | null>(null);
  const [fill, setFill] = useState<FillState>({ status: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const salary = formatSalary(job);
  const portalUrl = safeExternalUrl(job.url && openableJobUrl(job.url, job.title));

  const run = (action: () => Promise<{ status: string; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const outcome = await action();

      if (outcome.status === "error") {
        setError(outcome.message ?? "Algo deu errado.");
      }

      setConfirming(false);
    });
  };

  return (
    <li className="cine-reveal" style={{ ["--i" as string]: index }}>
      <Tilt className="h-full rounded-2xl" max={5}>
        <div className="cine-glass flex h-full flex-col gap-3 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <Link
              href={`/vagas/${job.id}`}
              className="flex min-w-0 flex-col gap-1 hover:underline"
            >
              <span className="font-[family-name:var(--font-display)] text-base font-semibold">
                {job.company}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {job.title}
              </span>
            </Link>
            {job.source && (
              <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {job.source}
              </span>
            )}
          </div>

          {fit && (
            <div className="flex flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT_TONE[fit.verdict]}`}
                >
                  Aderência {VERDICT_LABEL[fit.verdict]}
                </span>
                {application && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Candidatura: {application.status}
                  </span>
                )}
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {fit.origin === "agente" ? "pelo agente" : "por você"} em{" "}
                  {new Date(fit.analyzedAt).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              </span>
              {/* Texto do modelo sobre conteúdo de terceiros: só texto, nunca
                  HTML, e cortado no card; a análise inteira fica na vaga. */}
              <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-300">
                {fit.summary}
              </p>
            </div>
          )}

          {/* Sem veredito inventado: a vaga só passou pelo filtro do perfil e
              pela triagem por código. A análise é um clique na página dela. */}
          {!fit && origin === "agente" && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                Encontrada pelo agente, sem IA
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                em{" "}
                {new Date(savedAt).toLocaleDateString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
            </span>
          )}

          {!fit && application && (
            <span className="self-start rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Candidatura: {application.status}
            </span>
          )}

          <JobTags job={job} />
          <StackTags stack={job.stack} />

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link
              href={`/vagas/${job.id}`}
              className="font-medium underline underline-offset-4"
            >
              {fit ? "Ver análise completa" : "Analisar a vaga"}
            </Link>
            {tailored && (
              <Link
                href={`/vagas/${job.id}/curriculo`}
                className="font-medium underline underline-offset-4"
              >
                Currículo adaptado
              </Link>
            )}
          </div>

          {salary && (
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {salary}
            </span>
          )}

          {fill.status === "success" && (
            <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
              <span className="font-medium">
                Preenchido no navegador — revise e envie você.
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {fill.report.filled.length > 0
                  ? `Preenchi: ${fill.report.filled.map((f) => f.what).join(", ")}.`
                  : "Não reconheci nenhum campo neste formulário."}
              </span>
              {fill.report.skipped.length > 0 && (
                <span className="text-zinc-500 dark:text-zinc-400">
                  Ficaram com você: {fill.report.skipped.join(", ")}.
                </span>
              )}
            </div>
          )}

          {fill.status === "error" && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {fill.message}
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Numa linha só, no padrão do card da busca: o título já leva aos
              detalhes, então "Detalhes" saiu da fila de botões. */}
          <div className="mt-auto flex flex-nowrap items-center gap-1.5">
            {portalUrl && (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <IconExternalLink />
                Ver
              </a>
            )}

            {portalUrl && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    setFill(await fillFormAction(profileId, portalUrl));
                  })
                }
                title="Abre a vaga no navegador e preenche nome, email, telefone e links — nunca envia"
                className="cursor-pointer whitespace-nowrap rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {pending ? "Abrindo…" : "Preencher"}
              </button>
            )}

            {/* A vaga não sai da lista ao ser aplicada: o botão é que muda.
                "Já me candidatei" registra como aplicado, com a data de hoje:
                é o clique depois de enviar no site da empresa. */}
            {application ? (
              <Link
                href="/candidaturas"
                className="whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Acompanhar candidatura
              </Link>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => applyToJobAction(profileId, job.id))}
                className="cursor-pointer whitespace-nowrap rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {pending ? "Registrando…" : "Já me candidatei"}
              </button>
            )}

            {confirming ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => unsaveJobAction(profileId, job.id))}
                className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "Removendo…" : "Confirmar?"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                title="Remover das minhas vagas"
                aria-label="Remover das minhas vagas"
                className="cursor-pointer rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-600 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                <IconTrash />
              </button>
            )}
          </div>
        </div>
      </Tilt>
    </li>
  );
}
