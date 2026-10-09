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
import { safeExternalUrl } from "@/lib/safe-url";

interface SavedJobsListProps {
  profileId: string;
  saved: SavedJob[];
}

export function SavedJobsList({ profileId, saved }: SavedJobsListProps) {
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-4">
      <JobsTabs savedCount={saved.length} />

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Vagas que você guardou. Continuam aqui depois de aplicadas.
      </p>

      {saved.length === 0 ? (
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
          {saved.map((item, index) => (
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
  const { job, application } = item;
  const [error, setError] = useState<string | null>(null);
  const [fill, setFill] = useState<FillState>({ status: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const salary = formatSalary(job);
  const portalUrl = safeExternalUrl(job.url);

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

          <JobTags job={job} />
          <StackTags stack={job.stack} />

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
                href="/"
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
