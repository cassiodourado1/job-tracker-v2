"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Resume, TailoredResume, TailoredVersion } from "@recruit/shared";
import {
  saveTailoredResumeAction,
  tailorResumeAction,
} from "@/features/tailored-resume/actions";

/**
 * Currículo adaptado para esta vaga, pelo Claude.
 *
 * Só roda no clique: cada proposta é uma chamada paga. A proposta mostra o
 * antes e o depois de cada parte que mudou, editável, com os avisos do que o
 * servidor não achou no currículo. Nada é gravado até você salvar — o modelo
 * sugere, você decide (§4).
 */
export function TailorPanel({
  profileId,
  jobId,
  initialVersion,
}: {
  profileId: string;
  jobId: string;
  initialVersion: TailoredVersion | null;
}) {
  const [version, setVersion] = useState(initialVersion);
  const [proposal, setProposal] = useState<TailoredResume | null>(null);
  const [summary, setSummary] = useState("");
  const [descriptions, setDescriptions] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, startSaving] = useTransition();

  const tailor = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await tailorResumeAction(profileId, jobId);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      const next = outcome.proposal;

      setProposal(next);
      setSummary(next.changes.summary.after ?? "");
      setDescriptions(
        Object.fromEntries(
          next.changes.experiences.map((item) => [item.index, item.after]),
        ),
      );
    });
  };

  const save = () => {
    if (!proposal) {
      return;
    }

    // O que você editou nas caixas é o que vale, não a proposta crua.
    const resume: Resume = {
      ...proposal.resume,
      summary: summary.trim() || null,
      experiences: proposal.resume.experiences.map((experience, index) =>
        index in descriptions
          ? { ...experience, description: descriptions[index].trim() || null }
          : experience,
      ),
    };

    setError(null);
    startSaving(async () => {
      const outcome = await saveTailoredResumeAction(profileId, jobId, resume);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setVersion(outcome.version);
      setProposal(null);
    });
  };

  const warnings = proposal ? warningsOf(proposal) : [];

  return (
    <section className="cine-glass flex flex-col gap-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Currículo para esta vaga</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            O Claude reescreve o resumo e as experiências para destacar o que a
            vaga pede, e reordena as habilidades. Não acrescenta nada: o que a
            vaga pede e o currículo não mostra fica de fora, listado para você.
          </p>
        </div>
        <button
          type="button"
          onClick={tailor}
          disabled={pending || saving}
          className="cursor-pointer whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {pending
            ? "Adaptando…"
            : proposal || version
              ? "Adaptar de novo"
              : "Adaptar"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {version && !proposal && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">
              Versão salva em {formatDate(version.createdAt)}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              A candidatura que você registrar para esta vaga leva esta versão.
            </span>
          </div>
          <Link
            href={`/vagas/${jobId}/curriculo`}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Ver e salvar PDF
          </Link>
        </div>
      )}

      {proposal && (
        <div className="flex flex-col gap-5">
          {warnings.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <span className="font-medium">Confira antes de salvar</span>
              <ul className="list-disc pl-5">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <Field
            title="Resumo"
            before={proposal.changes.summary.before}
            value={summary}
            onChange={setSummary}
            rows={4}
          />

          {proposal.changes.experiences.map((item) => (
            <Field
              key={item.index}
              title={`${item.role} — ${item.company}`}
              before={item.before}
              value={descriptions[item.index] ?? ""}
              onChange={(value) =>
                setDescriptions((current) => ({
                  ...current,
                  [item.index]: value,
                }))
              }
              rows={6}
            />
          ))}

          {proposal.changes.skills.after.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className={HEADING}>Habilidades, na ordem para esta vaga</h3>
              <ul className="flex flex-wrap gap-1.5">
                {proposal.changes.skills.after.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs dark:bg-zinc-800"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {proposal.gaps.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className={HEADING}>
                A vaga pede e o seu currículo não mostra (ficou de fora)
              </h3>
              <ul className="list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                {proposal.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {saving ? "Salvando…" : "Salvar esta versão"}
            </button>
            <button
              type="button"
              onClick={() => setProposal(null)}
              disabled={saving}
              className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Descartar
            </button>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Seu currículo base não muda.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

const HEADING =
  "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

/** Antes, só para ler; depois, editável. */
function Field({
  title,
  before,
  value,
  onChange,
  rows,
}: {
  title: string;
  before: string | null;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={HEADING}>{title}</h3>
      {before && (
        <details className="text-xs text-zinc-500 dark:text-zinc-400">
          <summary className="cursor-pointer">Como está no currículo base</summary>
          <p className="mt-1 whitespace-pre-line">{before}</p>
        </details>
      )}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        maxLength={4000}
        className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
      />
    </div>
  );
}

/** Os avisos do servidor, em frases. Nenhum bloqueia salvar: você decide. */
function warningsOf(proposal: TailoredResume): string[] {
  const warnings: string[] = [];

  if (proposal.unknownTechs.length > 0) {
    warnings.push(
      `Cita tecnologia que o seu currículo não menciona: ${proposal.unknownTechs.join(", ")}.`,
    );
  }

  if (proposal.unverifiedNumbers.length > 0) {
    warnings.push(
      `Tem número que não está no seu currículo: ${proposal.unverifiedNumbers.join(", ")}.`,
    );
  }

  const ungrounded = proposal.facts.filter((fact) => !fact.grounded);

  if (ungrounded.length > 0) {
    warnings.push(
      `Afirmação sem trecho do currículo que a prove: ${ungrounded.map((fact) => fact.claim).join("; ")}.`,
    );
  }

  if (proposal.aiTells.length > 0) {
    warnings.push(
      `Expressões com cara de texto de IA: ${proposal.aiTells.join(", ")}.`,
    );
  }

  return warnings;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}
