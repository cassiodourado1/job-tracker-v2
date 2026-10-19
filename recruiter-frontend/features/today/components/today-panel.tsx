"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  APPLICATION_STATUSES,
  FOLLOW_UP_DAYS,
  FOLLOW_UP_SNOOZE_DAYS,
} from "@recruit/shared";
import type {
  ApplicationStatus,
  DueFollowUp,
  FollowUpAction,
  Today,
} from "@recruit/shared";
import { StatusBadge } from "@/features/applications/components/status-badge";
import { followUpAction } from "@/features/today/actions";

/**
 * O que pede ação hoje. Cada bloco leva para onde a ação acontece; só o
 * follow-up se resolve aqui mesmo, porque "fiz" e "adiar" não têm outro lugar.
 */
export function TodayPanel({ today }: { today: Today }) {
  const nothing =
    today.followUps.length === 0 &&
    today.pendingSuggestions === 0 &&
    today.savedNotApplied.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Hoje</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          O que pede ação agora na sua busca.
        </p>
      </div>

      {nothing && (
        <p className="cine-glass rounded-2xl px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Nada pendente hoje. Que tal{" "}
          <Link href="/vagas" className="font-medium underline underline-offset-4">
            procurar vagas
          </Link>
          ?
        </p>
      )}

      {today.followUps.length > 0 && (
        <Section
          title={`Follow-ups (${today.followUps.length})`}
          hint="Candidaturas paradas além do prazo do status. Mudar o status em Candidaturas também tira daqui."
        >
          <ul className="flex flex-col gap-2">
            {today.followUps.map((item) => (
              <FollowUpItem key={item.applicationId} item={item} />
            ))}
          </ul>
        </Section>
      )}

      {today.pendingSuggestions > 0 && (
        <Section
          title="Emails com sugestão de status"
          hint="O Claude leu respostas das empresas e sugeriu um novo status. Nada muda sem o seu clique."
        >
          <Link
            href="/candidaturas"
            className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {today.pendingSuggestions}{" "}
            {today.pendingSuggestions === 1 ? "sugestão esperando" : "sugestões esperando"}{" "}
            em Candidaturas →
          </Link>
        </Section>
      )}

      {today.savedNotApplied.length > 0 && (
        <Section
          title={`Vagas salvas sem candidatura (${today.savedNotApplied.length})`}
          hint="Você salvou e ainda não se candidatou. Vaga boa não fica aberta para sempre."
        >
          <ul className="flex flex-col gap-1.5">
            {today.savedNotApplied.slice(0, 8).map((job) => (
              <li
                key={job.jobId}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{job.company}</span>
                  <span className="text-zinc-500 dark:text-zinc-400"> · {job.title}</span>
                </span>
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  salva há {daysAgo(job.savedAt)}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/vagas/salvas"
            className="self-start text-sm font-medium underline underline-offset-4"
          >
            Ver e aplicar em Minhas vagas →
          </Link>
        </Section>
      )}

      <Section title="Funil" hint="Candidaturas ativas por status.">
        <div className="flex flex-wrap gap-2">
          {APPLICATION_STATUSES.map((status) => (
            <Link
              key={status}
              href="/candidaturas"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <StatusBadge status={status} />
              <span className="font-semibold tabular-nums">
                {today.pipeline[status] ?? 0}
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}

/** O que fazer, dito por status: o mesmo "parado há N dias" pede coisas diferentes. */
const ADVICE: Record<ApplicationStatus, (days: number) => string> = {
  rascunho: (d) => `Rascunho parado há ${d} dias — envie ou descarte.`,
  aplicado: (d) => `Sem resposta há ${d} dias — vale um follow-up com o recrutador.`,
  triagem: (d) => `Na triagem há ${d} dias — pergunte sobre os próximos passos.`,
  entrevista: (d) => `Entrevista há ${d} dias sem retorno — agradeça e peça um retorno.`,
  teste: (d) => `No teste há ${d} dias — confira o prazo ou peça retorno.`,
  oferta: (d) => `Proposta aberta há ${d} dias — responda à empresa.`,
  rejeitado: () => "",
};

function FollowUpItem({ item }: { item: DueFollowUp }) {
  const [done, setDone] = useState<FollowUpAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (action: FollowUpAction) => {
    setError(null);
    startTransition(async () => {
      const outcome = await followUpAction(item.applicationId, action);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setDone(action);
    });
  };

  if (done) {
    const days = done === "adiar" ? FOLLOW_UP_SNOOZE_DAYS : FOLLOW_UP_DAYS[item.status];

    return (
      <li className="rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {item.company} — {done === "adiar" ? "adiado" : "follow-up registrado"}; volta
        em {days} dias se nada mudar.
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.company}</span>
        <span className="min-w-0 truncate text-sm text-zinc-500 dark:text-zinc-400">
          {item.title}
        </span>
        <StatusBadge status={item.status} />
      </div>
      <p className="text-sm">{ADVICE[item.status](item.daysInStatus)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act("feito")}
          className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Fiz o follow-up
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act("adiar")}
          className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Adiar {FOLLOW_UP_SNOOZE_DAYS} dias
        </button>
        <Link
          href="/candidaturas"
          className="text-xs font-medium underline underline-offset-4"
        >
          Mudar status em Candidaturas
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cine-glass flex flex-col gap-3 rounded-2xl p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function daysAgo(iso: string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)),
  );

  return days === 0 ? "menos de um dia" : days === 1 ? "1 dia" : `${days} dias`;
}
