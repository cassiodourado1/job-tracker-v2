"use client";

import { useState, useTransition } from "react";
import type {
  InterviewQuestionCategory,
  SavedInterviewPrep,
} from "@recruit/shared";
import { prepareInterviewAction } from "@/features/interview-prep/actions";

/**
 * Preparação para a entrevista desta vaga, pelo Claude.
 *
 * Só roda no clique: cada preparação é uma chamada paga, e por isso fica
 * guardada — você gera quando a entrevista é marcada e relê no dia. Ponto de
 * resposta sem trecho do currículo que o sustente aparece marcado.
 */
export function PrepPanel({
  profileId,
  jobId,
  initial,
}: {
  profileId: string;
  jobId: string;
  initial: SavedInterviewPrep | null;
}) {
  const [saved, setSaved] = useState(initial);
  const [context, setContext] = useState(initial?.context ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const prepare = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await prepareInterviewAction(profileId, jobId, context);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setSaved(outcome.saved);
    });
  };

  const prep = saved?.prep;

  return (
    <section className="cine-glass flex flex-col gap-4 rounded-2xl p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">Preparação para entrevista</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          O Claude levanta as perguntas prováveis desta vaga, com pontos de
          resposta tirados do seu currículo, o que estudar antes e o que
          perguntar à empresa. Fica guardada para você reler no dia.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          value={context}
          onChange={(event) => setContext(event.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Como é a etapa? Ex.: técnica com o tech lead, conversa com RH, live coding. (opcional)"
          className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
        />
        <button
          type="button"
          onClick={prepare}
          disabled={pending}
          className="cursor-pointer whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {pending ? "Preparando…" : saved ? "Preparar de novo" : "Preparar"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {saved && prep && (
        <div className="flex flex-col gap-5">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Preparada em {formatDate(saved.createdAt)}
            {saved.context ? ` · etapa: ${saved.context}` : ""}
          </span>

          {prep.unverifiedNumbers.length > 0 && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Confira estes números antes de usar: não estão no seu currículo (
              {prep.unverifiedNumbers.join(", ")}).
            </p>
          )}

          {prep.questions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className={HEADING}>Perguntas prováveis</h3>
              <ol className="flex flex-col gap-4">
                {prep.questions.map((item, index) => (
                  <li key={index} className="flex flex-col gap-1.5 text-sm">
                    <span className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${CATEGORY_TONE[item.category]}`}
                      >
                        {CATEGORY_LABEL[item.category]}
                      </span>
                      <span className="font-medium">{item.question}</span>
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.why}
                    </span>
                    {item.answerPoints.length > 0 && (
                      <ul className="list-disc pl-5 text-zinc-700 dark:text-zinc-300">
                        {item.answerPoints.map((answer) => (
                          <li key={answer.point}>
                            {answer.point}
                            {!answer.grounded && (
                              <span
                                className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                title="Não achei no seu currículo o trecho que sustenta este ponto. Confira antes de usar."
                              >
                                confira
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {prep.toStudy.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className={HEADING}>Estudar antes</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {prep.toStudy.map((item) => (
                  <li key={item.topic}>
                    <span className="font-medium">{item.topic}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {" "}
                      · {item.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {prep.questionsToAsk.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className={HEADING}>Para você perguntar</h3>
              <ul className="list-disc pl-5 text-sm">
                {prep.questionsToAsk.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const HEADING =
  "text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

const CATEGORY_LABEL: Record<InterviewQuestionCategory, string> = {
  tecnica: "técnica",
  experiencia: "experiência",
  comportamental: "comportamental",
  empresa: "empresa",
};

const CATEGORY_TONE: Record<InterviewQuestionCategory, string> = {
  tecnica: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  experiencia:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  comportamental:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  empresa: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}
