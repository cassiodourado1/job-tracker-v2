"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AnswerDraft, AnswerLanguage, AnswerMode } from "@recruit/shared";
import { draftAnswerAction } from "@/features/answers/actions";

const MODES: { key: AnswerMode; label: string; hint: string }[] = [
  {
    key: "topics",
    label: "Tópicos",
    hint: "A IA diz o que responder e com quais fatos. Você escreve.",
  },
  {
    key: "draft",
    label: "Rascunho",
    hint: "A IA escreve um rascunho para você editar.",
  },
];

const LANGUAGES: { key: AnswerLanguage; label: string }[] = [
  { key: "pt", label: "Português" },
  { key: "en", label: "Inglês" },
  { key: "es", label: "Espanhol" },
];

/**
 * Perguntas do formulário de candidatura.
 *
 * Você cola a pergunta; a IA lê o seu currículo e esta vaga e devolve um
 * roteiro ou um rascunho. Nada é preenchido nem enviado: o texto fica aqui
 * para você editar e copiar.
 *
 * Os avisos são o ponto da tela, não enfeite. Uma resposta com experiência
 * inventada passa na triagem e cai na entrevista, então tudo que o servidor
 * não conseguiu apoiar no seu currículo aparece antes do botão de copiar.
 */
export function AnswerPanel({
  profileId,
  jobId,
}: {
  profileId: string;
  jobId: string;
}) {
  const [mode, setMode] = useState<AnswerMode>("topics");
  const [language, setLanguage] = useState<AnswerLanguage>("pt");
  const [question, setQuestion] = useState("");
  const [notes, setNotes] = useState("");
  const [limit, setLimit] = useState("");
  const [result, setResult] = useState<AnswerDraft | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const maxChars = limit.trim() === "" ? undefined : Number(limit);
  const limitInvalid =
    maxChars !== undefined &&
    (!Number.isInteger(maxChars) || maxChars < 50 || maxChars > 5000);

  const generate = () => {
    setError(null);
    startTransition(async () => {
      const outcome = await draftAnswerAction({
        profileId,
        jobId,
        question,
        notes: notes.trim() || undefined,
        maxChars,
        language,
        mode,
      });

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setResult(outcome.draft);
      // No modo rascunho, o texto vem pronto para editar. No modo tópicos, o
      // campo começa vazio: quem escreve é você.
      setText(outcome.draft.draft ?? "");
    });
  };

  return (
    <section
      id="perguntas"
      aria-label="Perguntas do formulário"
      className="cine-glass flex scroll-mt-24 flex-col gap-5 rounded-2xl p-6"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Perguntas do formulário</h2>
        <p className="text-sm text-zinc-400">
          Cole a pergunta da candidatura. A IA usa o seu currículo e esta vaga,
          e só afirma o que o currículo ou as suas anotações sustentam.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Modo" className="flex flex-wrap gap-2">
          {MODES.map((option) => {
            const on = mode === option.key;

            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMode(option.key)}
                className={`flex min-w-52 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-accent/70 ${
                  on
                    ? "border-accent/50 bg-accent/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <span className={`text-sm font-semibold ${on ? "text-zinc-50" : "text-zinc-200"}`}>
                  {option.label}
                  {option.key === "topics" && (
                    <span className="ml-2 text-xs font-normal text-accent">
                      recomendado
                    </span>
                  )}
                </span>
                <span className="text-xs text-zinc-400">{option.hint}</span>
              </button>
            );
          })}
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-zinc-300">Pergunta</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ex.: Por que você quer trabalhar conosco?"
            className="resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-accent/50"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-zinc-300">
            Seus tópicos <span className="text-zinc-500">(opcional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Fatos soltos que só você sabe. Ex.: liderei a migração, o deploy ficou 40% mais rápido."
            className="resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-accent/50"
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-zinc-300">Limite de caracteres</span>
            <input
              value={limit}
              onChange={(event) => setLimit(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="sem limite"
              aria-invalid={limitInvalid}
              className={`w-36 rounded-xl border bg-white/[0.03] px-3.5 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-accent/50 ${
                limitInvalid ? "border-red-400/60" : "border-white/10"
              }`}
            />
          </label>

          <div role="radiogroup" aria-label="Idioma" className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
            {LANGUAGES.map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={language === option.key}
                onClick={() => setLanguage(option.key)}
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm transition ${
                  language === option.key
                    ? "bg-white/10 font-medium text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={pending || question.trim().length < 3 || limitInvalid}
            className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-[0_8px_30px_-8px] shadow-accent/70 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {pending
              ? "A IA está escrevendo…"
              : mode === "topics"
                ? "Gerar tópicos"
                : "Gerar rascunho"}
          </button>
        </div>

        {limitInvalid && (
          <p className="text-xs text-red-300">Use um limite entre 50 e 5000.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={`${result.mode}-${result.draft ?? ""}-${result.topics.length}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="flex flex-col gap-4 border-t border-white/5 pt-5"
          >
            <Warnings result={result} />

            {result.mode === "topics" && result.topics.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-zinc-200">
                  O que responder
                </h3>
                <ol className="flex flex-col gap-2">
                  {result.topics.map((topic, index) => (
                    <li
                      key={index}
                      className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                        {index + 1}
                      </span>
                      <span className="flex flex-col gap-1">
                        {/* Texto gerado: vai como texto. */}
                        <span className="text-sm text-zinc-100">{topic.point}</span>
                        <span className="text-xs text-zinc-500">{topic.basis}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <Editor
              label={result.mode === "topics" ? "Sua resposta" : "Resposta"}
              placeholder={
                result.mode === "topics"
                  ? "Escreva aqui com as suas palavras, seguindo os tópicos."
                  : undefined
              }
              value={text}
              onChange={setText}
              maxChars={result.maxChars}
            />

            {result.short && (
              <Editor
                label="Versão curta"
                value={result.short}
                maxChars={null}
                readOnly
              />
            )}

            {result.mode === "draft" && (
              <p className="text-xs leading-relaxed text-zinc-500">
                Texto escrito pelo Claude carrega uma marca d&apos;água
                estatística da Anthropic, invisível e na escolha das palavras.
                Reescrever com as suas palavras deixa a resposta sua de
                verdade.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Tudo que o servidor não conseguiu apoiar no seu currículo, antes do texto.
 */
function Warnings({ result }: { result: AnswerDraft }) {
  const ungrounded = result.facts.filter((fact) => !fact.grounded);

  if (
    result.gaps.length === 0 &&
    ungrounded.length === 0 &&
    result.unverifiedNumbers.length === 0 &&
    result.aiTells.length === 0 &&
    result.excludedMentions.length === 0 &&
    !result.overLimit
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Primeiro: é verdade, mas você pediu para não mostrar, e resposta
          enviada não tem volta. */}
      {result.excludedMentions.length > 0 && (
        <Notice tone="red" title="Cita o que você marcou para não incluir">
          {result.excludedMentions.join(", ")}. Tire da resposta antes de usar.
        </Notice>
      )}

      {result.unverifiedNumbers.length > 0 && (
        <Notice tone="red" title="Números que não estão no seu currículo nem no histórico">
          {result.unverifiedNumbers.join(", ")} — confira antes de usar.
          Número inventado é o que mais facilmente se desmente numa entrevista.
        </Notice>
      )}

      {ungrounded.length > 0 && (
        <Notice tone="red" title="Afirmações sem trecho correspondente no currículo ou no histórico">
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {ungrounded.map((fact, index) => (
              <li key={index}>{fact.claim}</li>
            ))}
          </ul>
        </Notice>
      )}

      {result.gaps.length > 0 && (
        <Notice tone="amber" title="O que a vaga pede e o seu currículo não mostra">
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {result.gaps.map((gap, index) => (
              <li key={index}>{gap}</li>
            ))}
          </ul>
        </Notice>
      )}

      {result.aiTells.length > 0 && (
        <Notice tone="amber" title="Trechos com cara de texto de IA">
          {result.aiTells.join(", ")}. Vale reescrever esses pontos.
        </Notice>
      )}

      {result.overLimit && result.maxChars && (
        <Notice tone="amber" title="Passou do limite">
          O rascunho tem mais de {result.maxChars} caracteres. Corte antes de
          colar.
        </Notice>
      )}
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "red" | "amber";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
        tone === "red"
          ? "border-red-400/25 bg-red-500/10 text-red-200"
          : "border-amber-400/20 bg-amber-500/10 text-amber-200"
      }`}
    >
      <p className="mb-1 font-semibold">{title}</p>
      {children}
    </div>
  );
}

function Editor({
  label,
  value,
  onChange,
  maxChars,
  placeholder,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  maxChars: number | null;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const over = maxChars !== null && value.length > maxChars;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className={`text-xs tabular-nums ${over ? "text-red-300" : "text-zinc-500"}`}>
          {value.length}
          {maxChars !== null && ` / ${maxChars}`}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        rows={readOnly ? 3 : 6}
        placeholder={placeholder}
        className={`resize-y rounded-xl border bg-white/[0.03] px-3.5 py-2.5 text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-accent/50 ${
          over ? "border-red-400/50" : "border-white/10"
        }`}
      />
      <button
        type="button"
        onClick={copy}
        disabled={value.trim() === ""}
        className="self-start cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
