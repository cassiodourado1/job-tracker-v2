"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { IconBookmark, IconExternalLink, IconX } from "@/components/icons";
import { Tilt } from "@/components/motion";
import {
  dismissJobAction,
  markAppliedAction,
  saveJobAction,
  undismissJobAction,
} from "@/features/jobs/actions";
import {
  JobTags,
  StackTags,
  formatSalary,
} from "@/features/jobs/components/job-meta";
import type { JobSearchResult, JobVariant } from "@/features/jobs/types";
import { safeExternalUrl } from "@/lib/safe-url";

/**
 * O card de uma vaga externa.
 *
 * Vive fora do `job-search` porque tem três consumidores: a descoberta, a
 * extração por link e, na fase 2, a revisão de descartadas. Os três recebem o
 * mesmo `JobSearchResult`, e é isso que faz uma vaga extraída seguir pelo
 * mesmo caminho de salvar que uma vaga descoberta.
 */

export interface SearchResultItem {
  result: JobSearchResult;
  /** Já está em "Minhas vagas" — casado por URL no servidor. */
  saved: boolean;
  /**
   * Outros anúncios da mesma vaga (mesma empresa e título). Fora do `result`
   * de propósito: o que se salva é o anúncio do card, exatamente como antes.
   */
  others?: JobVariant[];
}

/**
 * Nome da fonte como você a reconhece, não como o código a chama.
 *
 * `linkedin-alerts` diz de onde a vaga veio de um jeito que importa: ela
 * chegou no SEU email, escolhida pelo LinkedIn para o seu perfil — é um sinal
 * de aderência que a pontuação não calcula.
 */
const SOURCE_LABELS: Record<string, string> = {
  "linkedin-alerts": "alerta LinkedIn",
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  lever: "Lever",
  gupy: "Gupy",
  remoteok: "RemoteOK",
  remotive: "Remotive",
  remotar: "Remotar",
  programathor: "Programathor",
  nerdin: "Nerdin",
  empresas: "empresa acompanhada",
  "portais-br": "portais BR",
};

const WORK_MODEL_LABELS: Record<string, string> = {
  remoto: "remoto",
  hibrido: "híbrido",
  presencial: "presencial",
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function ResultCard({
  index = 0,
  profileId,
  item,
  dismissible = false,
}: {
  /** Posição na grade, para a cascata de entrada. */
  index?: number;
  profileId: string;
  item: SearchResultItem;
  /**
   * Descartar só faz sentido na descoberta. Numa vaga que você mesmo colou o
   * link, recusar seria recusar a própria escolha.
   */
  dismissible?: boolean;
}) {
  const { result } = item;
  const others = item.others ?? [];
  // Descartar o card descarta o grupo: com só o primeiro descartado, o
  // anúncio seguinte assumiria o card na próxima busca e a vaga voltaria.
  const group = [
    result,
    ...others.map((other) => ({ ...result, url: other.url, source: other.source })),
  ];
  const [dismissed, setDismissed] = useState(false);
  // Estado local, e não só a prop: depois de salvar, o card confirma na hora,
  // sem depender de a página inteira revalidar.
  const [saved, setSaved] = useState(item.saved);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const salary = formatSalary(result);
  const portalUrl = safeExternalUrl(result.url);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await saveJobAction(profileId, result);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setSaved(true);
      setDismissed(false);
    });
  };

  // Salva e registra a candidatura como "aplicado", num clique: é o que se
  // faz logo depois de enviar no site da empresa.
  const markApplied = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await markAppliedAction(profileId, result);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setSaved(true);
      setApplied(true);
    });
  };

  const run = (action: () => Promise<{ status: string; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const outcome = await action();

      if (outcome.status === "error") {
        setError(outcome.message ?? "Algo deu errado.");
      }
    });
  };

  /** Uma ação por anúncio do grupo, em sequência; para no primeiro erro. */
  const runForGroup = (
    action: (job: JobSearchResult) => Promise<{ status: string; message?: string }>,
  ) =>
    run(async () => {
      for (const job of group) {
        const outcome = await action(job);

        if (outcome.status === "error") {
          return outcome;
        }
      }

      return { status: "success" };
    });

  // O card não some da grade: sumir reflui as quatro colunas inteiras a cada
  // clique, e o desfazer teria que morar em outro lugar. Ele encolhe e fica.
  if (dismissed) {
    return (
      <li className="flex h-full flex-col justify-center gap-2 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-zinc-400">
        <span className="line-clamp-2">
          Descartada — {result.company}: {result.title}
          {others.length > 0 && ` (${group.length} anúncios)`}
        </span>
        <button
          type="button"
          onClick={() => {
            setDismissed(false);
            runForGroup((job) => undismissJobAction(profileId, job.url));
          }}
          disabled={pending}
          className="cursor-pointer self-start text-sm font-medium underline underline-offset-4 transition hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
        >
          Desfazer
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </li>
    );
  }

  return (
    <li
      className="cine-reveal"
      // A cascata recomeça a cada lote de 40 da rolagem infinita: sem o
      // módulo, o lote novo entraria inteiro de uma vez, no atraso máximo.
      style={{ ["--i" as string]: index % 40 }}
    >
      <Tilt className="h-full rounded-2xl">
        <div className="cine-glass flex h-full flex-col gap-3 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-[family-name:var(--font-display)] text-base font-semibold" title={result.company}>
                {result.company}
              </span>
              {/* Duas linhas no máximo: sem isto cada card da grade tem uma altura
                  diferente, porque os títulos variam de 3 a 12 palavras. */}
              <span
                className="line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400"
                title={result.title}
              >
                {result.title}
              </span>
            </div>
            <span
              className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              title={`Origem: ${sourceLabel(result.source)}`}
            >
              {sourceLabel(result.source)}
            </span>
          </div>

          <JobTags job={result} />
          <StackTags stack={result.stack} max={4} />

          {salary && (
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {salary}
            </span>
          )}

          {others.length > 0 && <OtherPostings others={others} />}

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* mt-auto: data e ações encostam no rodapé, então os cards da linha
              terminam alinhados mesmo com conteúdos de tamanhos diferentes. A
              data é o penúltimo item, logo acima dos botões; sem data, o
              empurrão para o rodapé fica com os botões. */}
          <PostedAt postedAt={result.postedAt} source={result.source} />

          <div
            className={`${result.postedAt ? "" : "mt-auto "}flex flex-wrap items-center gap-2`}
          >
            {portalUrl && (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <IconExternalLink />
                Ver no portal
              </a>
            )}

            {dismissible && !saved && (
              <button
                type="button"
                onClick={() => {
                  setDismissed(true);
                  runForGroup((job) => dismissJobAction(profileId, job));
                }}
                disabled={pending}
                title={
                  others.length > 0
                    ? `Descartar os ${group.length} anúncios — não aparecem mais na busca`
                    : "Descartar — não aparece mais na busca"
                }
                aria-label="Descartar vaga"
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                <IconX />
              </button>
            )}

            {applied ? (
              <Link
                href="/"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-700 underline underline-offset-4 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
              >
                Candidatura registrada — acompanhar
              </Link>
            ) : saved ? (
              <Link
                href="/vagas/salvas"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-700 underline underline-offset-4 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
              >
                <IconBookmark />
                Salva — ver em Minhas vagas
              </Link>
            ) : (
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                <IconBookmark />
                {pending ? "Salvando…" : "Salvar"}
              </button>
            )}

            {!applied && (
              <button
                type="button"
                onClick={markApplied}
                disabled={pending}
                title="Já enviei a candidatura no site da empresa: salva a vaga e registra como aplicado, com a data de hoje"
                className="cursor-pointer rounded-lg border border-emerald-600/40 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
              >
                Já me candidatei
              </button>
            )}
          </div>
        </div>
      </Tilt>
    </li>
  );
}

/**
 * Os outros anúncios da mesma vaga, fechados por padrão: o card continua do
 * tamanho dos outros, e quem quer se candidatar a mais de um abre a lista.
 */
function OtherPostings({ others }: { others: JobVariant[] }) {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer list-none text-zinc-500 underline-offset-4 transition hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100">
        +{others.length} {others.length === 1 ? "anúncio igual" : "anúncios iguais"} nesta empresa
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {others.map((other) => {
          const url = safeExternalUrl(other.url);
          const details = [
            other.location,
            other.workModel ? WORK_MODEL_LABELS[other.workModel] : null,
            other.postedAt
              ? new Date(other.postedAt).toLocaleDateString("pt-BR")
              : null,
            sourceLabel(other.source),
          ].filter(Boolean);

          return (
            <li key={other.url} className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={details.join(" · ")}>
                {details.join(" · ")}
              </span>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1 text-xs font-medium underline underline-offset-4"
                >
                  <IconExternalLink />
                  abrir
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/**
 * Quando a vaga foi publicada, em tempo relativo — "há 3 dias" diz mais numa
 * lista que "04/10/2026" — com a data exata ao passar o mouse.
 *
 * Vaga nova tem menos gente concorrendo, então até três dias ganha destaque.
 * Sem data (a Programathor não informa), não mostra nada em vez de inventar.
 *
 * No alerta do LinkedIn a data é a do PRIMEIRO alerta em que a vaga apareceu,
 * não a da publicação: o rótulo diz isso.
 */
function PostedAt({
  postedAt,
  source,
}: {
  postedAt: string | null;
  source: string;
}) {
  // "Agora" capturado uma vez, na montagem: ler o relógio a cada render faria
  // o texto mudar sozinho entre renders.
  const [now] = useState(() => Date.now());

  if (!postedAt) {
    return null;
  }

  const date = new Date(postedAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const days = Math.floor((now - date.getTime()) / (24 * 60 * 60 * 1000));
  const fresh = days <= 3;
  const verb = source === "linkedin-alerts" ? "no alerta" : "publicada";

  return (
    <span
      className={`mt-auto text-xs ${fresh ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}`}
      title={date.toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}
    >
      {verb} {relativeDays(days)}
    </span>
  );
}

function relativeDays(days: number): string {
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 14) return `há ${days} dias`;
  if (days < 60) return `há ${Math.floor(days / 7)} semanas`;

  return `há ${Math.floor(days / 30)} meses`;
}

