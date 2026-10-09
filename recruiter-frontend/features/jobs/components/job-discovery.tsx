"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_JOB_SORT,
  JOB_SORTS,
  type Exhaustion,
  type JobPreferences,
  type JobSort,
} from "@recruit/shared";
import { discoverAction } from "@/features/jobs/actions";
import { ExtractCard } from "@/features/jobs/components/extract-card";
import {
  FiltersModal,
  countMarked,
} from "@/features/jobs/components/filters-modal";
import { JobsTabs } from "@/features/jobs/components/jobs-tabs";
import {
  ResultCard,
  type SearchResultItem,
} from "@/features/jobs/components/result-card";
import type { DiscoveredJob } from "@/features/jobs/types";
import { saveProfileAction } from "@/features/profile/actions";

/**
 * "Buscar" traz o primeiro lote; os seguintes chegam conforme você rola.
 *
 * O ritmo NÃO vem de relógio. Medido, buscar em todas as fontes leva ~3s na
 * primeira vez e sai da memória depois — um laço por tempo despejaria as 800
 * vagas em segundos. Então o próximo lote é pedido quando você chega perto do
 * fim da lista: quem dita o ritmo é a triagem, não um timer.
 */

interface JobDiscoveryProps {
  profileId: string;
  query: string;
  preferences: JobPreferences;
  savedUrls: string[];
  savedCount: number;
}

/** Trava contra laço infinito se o cursor parar de avançar por um defeito. */
const MAX_BATCHES = 25;

export function JobDiscovery({
  profileId,
  query,
  preferences,
  savedUrls,
  savedCount,
}: JobDiscoveryProps) {
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [exhausted, setExhausted] = useState<Exhaustion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [demand, setDemand] = useState(0);

  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState<JobSort>(DEFAULT_JOB_SORT);
  const [filters, setFilters] = useState(preferences);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savingFilters, setSavingFilters] = useState(false);

  // Cursor em ref, não em state: ele muda a cada lote, e como state entraria
  // nas dependências do efeito e dispararia o lote seguinte sozinho — o
  // despejo que a pausa por rolagem existe para evitar.
  const cursor = useRef<string | null>(null);
  const batches = useRef(0);
  const runId = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const saved = useRef(new Set(savedUrls));

  // Derivado, e não um state próprio: chamar setState dentro do efeito dispara
  // render em cascata (react-hooks/set-state-in-effect). Um lote está em voo
  // enquanto houver mais pedidos do que lotes concluídos. É o único momento em
  // que há rede trabalhando, e o único em que a tela mostra carregamento.
  const pending = running && demand > completed;

  const askForMore = useCallback(() => setDemand((value) => value + 1), []);

  // `running` não é "buscando": é "ainda há lote para pedir". Parado de rolar,
  // nada acontece na rede. Por isso não há botão de parar nem cronômetro —
  // eles contavam um tempo em que nada estava sendo buscado.
  const stop = useCallback(() => setRunning(false), []);

  // Cada "Buscar" recomeça do zero: limpa os cards e o cursor.
  const start = useCallback(() => {
    setError(null);
    setExhausted(null);
    setItems([]);
    setTotal(null);
    cursor.current = null;
    setRunning(true);
    batches.current = 0;
    askForMore();
  }, [askForMore]);

  /** Critério novo, ordem nova: a lista acumulada não vale mais. */
  const applyFilters = (next: JobPreferences) => {
    setSavingFilters(true);

    void (async () => {
      const outcome = await saveProfileAction(profileId, { preferences: next });

      setSavingFilters(false);

      if (outcome.status === "error") {
        setError(outcome.message);

        return;
      }

      setFilters(next);
      setFiltersOpen(false);
      setItems([]);
      setTotal(null);
      cursor.current = null;
      start();
    })();
  };

  // Busca um lote. `runId` é o que sobrevive ao efeito duplo do StrictMode em
  // desenvolvimento: sem ele, o primeiro clique dispara dois lotes.
  useEffect(() => {
    if (!running || demand === 0 || exhausted) {
      return;
    }

    const id = runId.current + 1;

    runId.current = id;

    let cancelled = false;
    const alive = () => !cancelled && runId.current === id;

    void (async () => {
      const outcome = await discoverAction({
        profileId,
        cursor: cursor.current ?? undefined,
        q: query || undefined,
        expanded,
        sort,
      });

      if (!alive()) {
        return;
      }

      setCompleted((value) => value + 1);

      if (outcome.status === "error") {
        setError(outcome.message);
        stop();

        return;
      }

      const result = outcome.result;

      batches.current += 1;
      cursor.current = result.nextCursor;
      setTotal(result.total);
      setFailed(result.failedSources);

      setItems((previous) => merge(previous, result.items, saved.current));

      if (
        result.exhausted ||
        !result.nextCursor ||
        batches.current >= MAX_BATCHES
      ) {
        setExhausted(result.exhausted ?? "fim");
        stop();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demand, running, exhausted, profileId, query, expanded, sort, stop]);

  // Pede o próximo lote quando o fim da lista aparece na tela.
  useEffect(() => {
    const node = sentinel.current;

    if (!node || !running || pending || exhausted) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        askForMore();
      }
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, [running, pending, exhausted, items.length, askForMore]);

  const marked = countMarked(filters);

  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-4">
      {/* Cabeçalho e extração seguem estreitos: texto em linha larga é ruim de
          ler. Só a grade de vagas aproveita a tela inteira. */}
      <div className="max-w-4xl">
        <JobsTabs savedCount={savedCount} />
      </div>

      <section className="cine-reveal cine-glass flex flex-col gap-3 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold">Procurar vagas</h2>
              <Counter items={items.length} total={total} />
              {query && <SearchFilterNotice query={query} />}
            </div>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Traz vagas de portais, agregadores e empresas; mais vagas chegam
              conforme você rola. Nada é gravado até você salvar.
              {expanded && (
                <>
                  {" "}
                  <span className="text-zinc-700 dark:text-zinc-300">
                    Ampliada, inclui InfoJobs e Vagas.com — mais vagas, e uns 10
                    segundos a mais na primeira busca.
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Filtros
              {marked > 0 && (
                <span className="ml-2 rounded-full bg-zinc-900 px-1.5 py-0.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {marked}
                </span>
              )}
            </button>

            {/* Acervo diferente: alternar zera a lista, senão o começo viria
                da busca estreita e o resto da ampliada. */}
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={expanded}
                onChange={(event) => {
                  setExpanded(event.target.checked);
                  setItems([]);
                  setTotal(null);
                  setExhausted(null);
                  cursor.current = null;
                }}
                className="size-4 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
              />
              Ampliar a área de busca
            </label>

            <button
              type="button"
              onClick={start}
              disabled={pending}
              aria-busy={pending}
              className="flex cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-medium text-zinc-950 shadow-[0_8px_30px_-8px] shadow-accent/70 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80"
            >
              {pending ? (
                <Spinner />
              ) : (
                <span className="size-2 rounded-full bg-zinc-950/60" />
              )}
              {pending ? "Buscando…" : "Buscar"}
            </button>
          </div>
        </div>

        {/* GET puro: o filtro de texto fica na URL, é compartilhável e não
            precisa de JS. Os demais critérios vivem no perfil. */}
        <form action="/vagas" className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Filtrar por cargo ou tecnologia"
            className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100"
          />
          <button
            type="submit"
            className="cursor-pointer rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Filtrar
          </button>

          {/* Ordem diferente: a lista recomeça do topo. Reordenar só o que
              já está na tela misturaria a ordem nova com lotes que vieram
              na antiga, e o cursor seguinte não casaria com nenhuma. */}
          <label className="flex shrink-0 items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            Ordenar
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as JobSort);
                setItems([]);
                setTotal(null);
                setExhausted(null);
                cursor.current = null;
              }}
              className="cursor-pointer rounded-lg border border-zinc-300 bg-transparent px-2 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {JOB_SORTS.map((option) => (
                <option key={option} value={option} className="text-zinc-900">
                  {SORT_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </form>

        <Status exhausted={exhausted} failed={failed} error={error} />
      </section>

      <div className="max-w-4xl">
        <ExtractCard profileId={profileId} />
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item, index) => (
            <ResultCard
              key={item.result.url}
              index={index}
              profileId={profileId}
              item={item}
              dismissible
            />
          ))}
        </ul>
      )}

      {/* Enquanto o primeiro lote não chega, cards de carregamento no lugar
          dos resultados: a primeira busca consulta os portais e leva uns
          segundos. Nos lotes seguintes, uma linha deles no fim da lista. */}
      {items.length === 0 && running && !error && (
        <LoadingGrid label="Consultando os portais…" count={8} />
      )}
      {items.length > 0 && pending && (
        <LoadingGrid label="Carregando mais vagas…" count={4} />
      )}

      {items.length === 0 && !running && (
        <p className="cine-glass rounded-2xl px-6 py-14 text-center text-sm text-zinc-400">
          Clique em Buscar para começar.
        </p>
      )}

      {/* Barra no topo da tela: com a lista rolada, o botão e os cards de
          carregamento podem estar fora de vista. */}
      {pending && (
        <div
          aria-hidden
          className="fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-gradient-to-r from-accent to-accent-2"
        />
      )}

      <div ref={sentinel} aria-hidden className="h-px" />

      <FiltersModal
        open={filtersOpen}
        preferences={filters}
        pending={savingFilters}
        onCancel={() => setFiltersOpen(false)}
        onConfirm={applyFilters}
      />
    </div>
  );
}

/** Girando no botão enquanto um lote está em voo. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950"
    />
  );
}

/** Cards vazios pulsando, no formato dos cards de vaga, enquanto a busca roda. */
function LoadingGrid({ label, count }: { label: string; count: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <span
          aria-hidden
          className="size-3.5 animate-spin rounded-full border-2 border-zinc-400/40 border-t-zinc-500 dark:border-t-zinc-300"
        />
        {label}
      </span>
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: count }, (_, index) => (
          <li
            key={index}
            aria-hidden
            className="cine-glass flex h-56 animate-pulse flex-col gap-3 rounded-2xl p-5"
          >
            <span className="h-4 w-1/2 rounded bg-zinc-300/40 dark:bg-zinc-700/60" />
            <span className="h-3 w-3/4 rounded bg-zinc-300/30 dark:bg-zinc-700/40" />
            <span className="mt-2 flex gap-2">
              <span className="h-5 w-16 rounded-full bg-zinc-300/30 dark:bg-zinc-700/40" />
              <span className="h-5 w-14 rounded-full bg-zinc-300/30 dark:bg-zinc-700/40" />
            </span>
            <span className="mt-auto h-8 w-full rounded-lg bg-zinc-300/30 dark:bg-zinc-700/40" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Quantas vagas passam no filtro, ao lado do título.
 *
 * O total é o que importa ao ajustar o filtro — é ele que diz se o critério
 * novo cortou demais —, e antes ficava numa linha miúda abaixo da busca.
 * "Na tela" só aparece enquanto há mais para carregar: igual ao total, seria
 * o mesmo número duas vezes.
 */
const SORT_LABELS: Record<JobSort, string> = {
  recentes: "Mais recentes",
  relevancia: "Mais relevantes",
  empresa: "Empresa (A–Z)",
  cargo: "Cargo (A–Z)",
};

function Counter({ items, total }: { items: number; total: number | null }) {
  if (total === null) {
    return null;
  }

  return (
    <span className="flex items-baseline gap-2 text-sm text-zinc-500 dark:text-zinc-400">
      <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-semibold text-white tabular-nums dark:bg-zinc-100 dark:text-zinc-900">
        {total} {total === 1 ? "vaga" : "vagas"}
      </span>
      {items < total && (
        <span className="text-xs tabular-nums">{items} na tela</span>
      )}
    </span>
  );
}

/**
 * Aviso de que a busca está restrita por um texto.
 *
 * Com texto na caixa, a descoberta muda de natureza: os portais por busca
 * procuram SÓ esse texto, no lugar dos termos do perfil, e a vaga precisa ter
 * a palavra no título, na empresa ou nas tecnologias. O texto fica na URL e
 * sobrevive a recarregar a página — sem este aviso, 525 vagas virando 148
 * parecia defeito.
 */
function SearchFilterNotice({ query }: { query: string }) {
  return (
    <span
      className="flex items-baseline gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      title="Com texto na busca, os portais procuram só este texto, no lugar dos seus termos de busca, e a vaga precisa ter a palavra no título, na empresa ou nas tecnologias."
    >
      Filtrando por “{query}”
      <span aria-hidden="true">·</span>
      <Link
        href="/vagas"
        className="font-medium underline underline-offset-2 hover:no-underline"
      >
        limpar
      </Link>
    </span>
  );
}

function Status({
  exhausted,
  failed,
  error,
}: {
  exhausted: Exhaustion | null;
  failed: string[];
  error: string | null;
}) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">

      {/* As duas mensagens são diferentes de propósito: uma pede para afrouxar
          o filtro, a outra diz que você está em dia. */}
      {exhausted === "fim" && (
        <span className="text-zinc-700 dark:text-zinc-300">
          Acabaram as vagas que passam no seu filtro.
        </span>
      )}

      {exhausted === "nada-novo" && (
        <span className="text-zinc-700 dark:text-zinc-300">
          Você já viu todas as vagas disponíveis. Nada novo por enquanto.
        </span>
      )}

      {failed.length > 0 && (
        <span>
          Sem resposta de {failed.join(", ")} nesta busca — a lista está
          incompleta.
        </span>
      )}
    </div>
  );
}

/**
 * Junta o lote novo ao que já está na tela, sem repetir.
 *
 * Necessário mesmo com cursor estável: o cache do servidor pode expirar no meio
 * da sessão e trazer de volta uma vaga que já estava aqui.
 */
function merge(
  previous: SearchResultItem[],
  incoming: DiscoveredJob[],
  saved: Set<string>,
): SearchResultItem[] {
  const seen = new Set(previous.map((item) => item.result.url));
  const added = incoming
    .filter((job) => !seen.has(job.url))
    // `others` sai do `result`: o que se salva é o anúncio do card, sem a
    // lista dos outros grudada nele.
    .map(({ others, ...result }) => ({
      result,
      others,
      saved: saved.has(result.url),
    }));

  return added.length > 0 ? [...previous, ...added] : previous;
}
