"use client";

import { useEffect, useRef, useState } from "react";
import {
  CONTRACT_TYPES,
  DEFAULT_LINKEDIN_MAX_AGE_DAYS,
  LINKEDIN_AGE_OPTIONS,
  LINKEDIN_MAX_AGE_LIMIT,
  LOCATION_SCOPES,
  MAX_SEARCH_TERMS,
  SENIORITIES,
  STACK_LABELS,
  WORK_MODELS,
  type JobPreferences,
  type LocationScope,
  type StackLabel,
} from "@recruit/shared";

/**
 * O filtro da descoberta.
 *
 * Duas naturezas convivem aqui, e a tela precisa deixar isso claro: escopo,
 * modalidade, contrato e senioridade CORTAM; stack PRIORIZA. Cortar por stack
 * sumiria com metade do acervo por falta de descrição, não por não combinar.
 *
 * Nada é aplicado enquanto você marca — só ao confirmar. Marcar dispara busca
 * a cada clique seria uma rodada nos portais por caixinha.
 */

interface FiltersModalProps {
  open: boolean;
  preferences: JobPreferences;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (preferences: JobPreferences) => void;
}

export function FiltersModal({
  open,
  preferences,
  pending,
  onCancel,
  onConfirm,
}: FiltersModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<JobPreferences>(preferences);

  // Abre e fecha pelo método nativo: `open` como atributo renderiza sem
  // backdrop e sem prender o foco.
  useEffect(() => {
    const node = dialog.current;

    if (!node) {
      return;
    }

    if (open && !node.open) {
      setDraft(preferences);
      node.showModal();
    }

    if (!open && node.open) {
      node.close();
    }
  }, [open, preferences]);

  // O Esc fecha o <dialog> por fora do React; sem isto o estado do pai
  // continuaria achando que está aberto.
  useEffect(() => {
    const node = dialog.current;

    if (!node) {
      return;
    }

    const handler = () => onCancel();

    node.addEventListener("close", handler);

    return () => node.removeEventListener("close", handler);
  }, [onCancel]);

  const patch = (changes: Partial<JobPreferences>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const toggleIn = <T,>(list: readonly T[], value: T): T[] =>
    list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];

  const marked = countMarked(draft);

  return (
    <dialog
      ref={dialog}
      className="m-auto w-[min(46rem,92vw)] rounded-2xl bg-white p-0 text-zinc-900 backdrop:bg-black/40 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <div className="flex max-h-[80vh] flex-col">
        <header className="flex items-baseline justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Filtros da busca</h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {marked === 0
              ? "Nenhum filtro — busca ampla"
              : `${marked} ${marked === 1 ? "critério" : "critérios"}`}
          </span>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          <Group
            title="Termos de busca"
            hint={`O que a Gupy e os portais brasileiros procuram quando a caixa de busca está vazia. Decide o que CHEGA: sem "front-end" aqui, vaga de front-end nem entra na lista. Até ${MAX_SEARCH_TERMS}.`}
          >
            <KeywordList
              values={draft.searchTerms}
              max={MAX_SEARCH_TERMS}
              min={1}
              placeholder="ex.: front-end"
              onChange={(searchTerms) => patch({ searchTerms })}
            />
          </Group>

          <Group
            title="Título precisa conter"
            hint="Uma destas basta. Corta o que chegou. Vazio = qualquer título."
          >
            <KeywordList
              values={draft.titleIncludes}
              max={30}
              placeholder="ex.: frontend"
              onChange={(titleIncludes) => patch({ titleIncludes })}
            />
          </Group>

          <Group
            title="Título não pode conter"
            hint="Vence a lista acima: título com qualquer uma destas some."
          >
            <KeywordList
              values={draft.titleExcludes}
              max={30}
              placeholder="ex.: estágio"
              onChange={(titleExcludes) => patch({ titleExcludes })}
            />
          </Group>

          <Group
            title="Localização"
            hint="Marcar uma desmarca a outra."
          >
            <AllChip
              label="todas"
              active={draft.scope === null}
              onClick={() => patch({ scope: null })}
            />
            {LOCATION_SCOPES.map((scope) => (
              <Chip
                key={scope}
                label={scope === "brasil" ? "Brasil" : "Internacional"}
                active={draft.scope === scope}
                onClick={() =>
                  patch({
                    scope: draft.scope === scope ? null : (scope as LocationScope),
                  })
                }
              />
            ))}
          </Group>

          <Group title="Modalidade" hint="Vaga que não declarou continua aparecendo.">
            <AllChip
              label="todas"
              active={draft.workModels.length === 0}
              onClick={() => patch({ workModels: [] })}
            />
            {WORK_MODELS.map((model) => (
              <Chip
                key={model}
                label={model === "hibrido" ? "híbrido" : model}
                active={draft.workModels.includes(model)}
                onClick={() =>
                  patch({ workModels: toggleIn(draft.workModels, model) })
                }
              />
            ))}
          </Group>

          <Group
            title="Contrato"
            hint="Só a Gupy declara isso de forma confiável; as demais deixam em branco."
          >
            <AllChip
              label="todos"
              active={draft.contractTypes.length === 0}
              onClick={() => patch({ contractTypes: [] })}
            />
            {CONTRACT_TYPES.map((type) => (
              <Chip
                key={type}
                label={type.toUpperCase()}
                active={draft.contractTypes.includes(type)}
                onClick={() =>
                  patch({ contractTypes: toggleIn(draft.contractTypes, type) })
                }
              />
            ))}
          </Group>

          <Group
            title="Senioridade"
            hint="Deduzida do título — nenhum portal declara este campo."
          >
            <AllChip
              label="todas"
              active={draft.seniorities.length === 0}
              onClick={() => patch({ seniorities: [] })}
            />
            {SENIORITIES.map((level) => (
              <Chip
                key={level}
                label={level}
                active={draft.seniorities.includes(level)}
                onClick={() =>
                  patch({ seniorities: toggleIn(draft.seniorities, level) })
                }
              />
            ))}
          </Group>

          <Group
            title="Vagas do LinkedIn"
            hint="Os alertas do LinkedIn não dizem se a vaga ainda aceita candidatura, e o app não abre o site para conferir. Vaga de alerta antigo é a que mais costuma estar fechada: escolha até quantos dias ela ainda aparece."
          >
            {LINKEDIN_AGE_OPTIONS.map((days) => (
              <Chip
                key={days}
                // O teto é tudo o que a fonte lê da caixa: acima dele não há
                // vaga de alerta para mostrar, então "todas" é exato.
                label={
                  days === LINKEDIN_MAX_AGE_LIMIT
                    ? `todas (até ${days} dias)`
                    : `até ${days} dias`
                }
                active={draft.linkedinMaxAgeDays === days}
                onClick={() => patch({ linkedinMaxAgeDays: days })}
              />
            ))}
          </Group>

          <Group
            title="Tecnologias"
            hint="Estas PRIORIZAM, não cortam: marcar Go sobe as vagas de Go sem esconder as outras."
          >
            <AllChip
              label="todas"
              active={draft.stacks.length === 0}
              onClick={() => patch({ stacks: [] })}
            />
            {STACK_LABELS.map((label) => (
              <Chip
                key={label}
                label={label}
                active={draft.stacks.includes(label)}
                onClick={() =>
                  patch({ stacks: toggleIn(draft.stacks, label as StackLabel) })
                }
              />
            ))}
          </Group>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                scope: null,
                workModels: [],
                contractTypes: [],
                seniorities: [],
                stacks: [],
                linkedinMaxAgeDays: DEFAULT_LINKEDIN_MAX_AGE_DAYS,
              })
            }
            className="cursor-pointer text-sm text-zinc-500 underline underline-offset-4 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Limpar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConfirm(draft)}
              disabled={pending}
              className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {pending ? "Salvando…" : "Aplicar filtros"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Lista de palavras editável: cada uma vira um chip removível, e Enter
 * acrescenta a digitada.
 *
 * O schema limpa espaços e corta em 40 caracteres; aqui a tela só evita
 * repetir palavra (sem diferenciar maiúscula) e respeita o mínimo e o máximo,
 * para o "Aplicar" nunca esbarrar num 400 por algo que dava para impedir.
 */
function KeywordList({
  values,
  max,
  min = 0,
  placeholder,
  onChange,
}: {
  values: string[];
  max: number;
  min?: number;
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [text, setText] = useState("");
  const full = values.length >= max;

  const add = () => {
    const word = text.trim().slice(0, 40);

    if (
      word &&
      !full &&
      !values.some((value) => value.toLowerCase() === word.toLowerCase())
    ) {
      onChange([...values, word]);
    }

    setText("");
  };

  return (
    <>
      {values.map((value) => (
        <span
          key={value}
          className="flex items-center gap-1 rounded-full border border-zinc-900 bg-zinc-900 py-1 pl-3 pr-1.5 text-xs font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {value}
          <button
            type="button"
            aria-label={`Remover ${value}`}
            disabled={values.length <= min}
            onClick={() => onChange(values.filter((item) => item !== value))}
            className="cursor-pointer rounded-full px-1 leading-none opacity-70 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        disabled={full}
        placeholder={full ? `máximo de ${max}` : placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter dentro do <dialog> não pode submeter nem fechar nada.
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
        className="min-w-32 flex-1 rounded-full border border-dashed border-zinc-300 bg-transparent px-3 py-1 text-xs outline-none transition focus:border-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:focus:border-zinc-100"
      />
    </>
  );
}

/**
 * "Todas" é o estado vazio do grupo, com nome. Lista vazia já significava
 * "tanto faz" (ver `jobPreferencesSchema`), mas a tela não dizia: com nada
 * marcado, não dava para saber se o grupo estava liberado ou esquecido.
 *
 * Por isso não é um valor a mais no schema: marcar "todas" esvazia a lista, e
 * marcar qualquer opção desmarca "todas" por consequência.
 */
function AllChip(props: { label: string; active: boolean; onClick: () => void }) {
  return <Chip {...props} />;
}

export function countMarked(preferences: JobPreferences): number {
  return (
    (preferences.scope ? 1 : 0) +
    preferences.workModels.length +
    preferences.contractTypes.length +
    preferences.seniorities.length +
    preferences.stacks.length
  );
}
