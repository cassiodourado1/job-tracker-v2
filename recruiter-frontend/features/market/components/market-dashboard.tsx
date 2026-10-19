import Link from "next/link";
import type {
  DashboardWindow,
  JobsDashboard,
  WorkModel,
} from "@recruit/shared";
import { TimelineChart } from "@/features/market/components/timeline-chart";
import {
  seriesOf,
  sourceColor,
  sourceLabel,
} from "@/features/market/sources";

/**
 * O mercado nos seus filtros: quantas vagas saíram na janela, de onde, de
 * quais empresas e pedindo o quê.
 *
 * Componente de servidor: só a linha do tempo precisa de hover. A janela fica
 * na URL (`?janela=7d`), então trocar é um link e a página é compartilhável.
 */

const WINDOW_LABEL: Record<DashboardWindow, string> = {
  "24h": "24 horas",
  "7d": "7 dias",
  "30d": "30 dias",
};

const WORK_MODEL_LABEL: Record<WorkModel, string> = {
  remoto: "Remoto",
  hibrido: "Híbrido",
  presencial: "Presencial",
};

export function MarketDashboard({ data }: { data: JobsDashboard }) {
  const window = data.window;
  const percent = (value: number) =>
    data.total === 0 ? 0 : Math.round((value / data.total) * 100);

  return (
    <div className="market-viz mx-auto flex w-full max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Mercado</h1>
          <p className="text-sm text-zinc-400">
            Vagas que passam nos seus filtros, publicadas nas últimas{" "}
            {WINDOW_LABEL[window]} · atualizado às {formatTime(data.generatedAt)}
          </p>
        </div>

        <nav aria-label="Período" className="flex gap-1 rounded-xl bg-zinc-900 p-1">
          {(Object.keys(WINDOW_LABEL) as DashboardWindow[]).map((option) => (
            <Link
              key={option}
              href={`/?janela=${option}`}
              aria-current={option === window ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                option === window
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {WINDOW_LABEL[option]}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label={`Vagas publicadas (${WINDOW_LABEL[window]})`}
          value={data.total}
          note={
            // Só na janela de 24h: vaga velha sai do ar e some da fonte, então
            // a janela anterior de 7 ou 30 dias sempre parece menor do que foi.
            window === "24h" ? (
              <Trend now={data.total} before={data.previousTotal} />
            ) : (
              "uma vaga em vários sites conta uma vez"
            )
          }
        />
        <Tile
          label="Remotas"
          value={data.remote}
          note={`${percent(data.remote)}% das vagas publicadas`}
        />
        <Tile
          label="Empresas contratando"
          value={data.companies}
          note="com pelo menos uma vaga no período"
        />
        <Tile
          label="Sem data de publicação"
          value={data.undated}
          note="passam nos filtros, mas não entram nos números"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card
          className="lg:col-span-2"
          title="Qual site tem mais vagas"
          subtitle={`Vagas publicadas nas últimas ${WINDOW_LABEL[window]}, por fonte`}
        >
          <Ranked
            rows={data.bySource.map((row) => ({
              key: row.source,
              label: sourceLabel(row.source),
              count: row.count,
              color: sourceColor(seriesOf(row.source)),
            }))}
            total={data.total}
            showShare
          />
        </Card>

        <Card
          className="lg:col-span-3"
          title={`Vagas publicadas por ${window === "24h" ? "hora" : "dia"}`}
          subtitle="Pela data de publicação (horário de Brasília), empilhadas por fonte"
        >
          <TimelineChart timeline={data.timeline} window={window} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Empresas que mais publicaram" subtitle="As 10 primeiras">
          <Ranked
            rows={data.byCompany.map((row) => ({
              key: row.company,
              label: row.company,
              count: row.count,
            }))}
          />
        </Card>

        <Card
          title="Tecnologias mais pedidas"
          subtitle="Quantas vagas citam cada uma"
        >
          <Ranked
            rows={data.byStack.map((row) => ({
              key: row.stack,
              label: row.stack,
              count: row.count,
            }))}
          />
        </Card>

        <Card title="Modalidade" subtitle="Como as vagas declaram o trabalho">
          <Ranked
            rows={data.byWorkModel.map((row) => ({
              key: row.workModel ?? "nao-informa",
              label: row.workModel
                ? WORK_MODEL_LABEL[row.workModel]
                : "Não informa",
              count: row.count,
            }))}
            total={data.total}
            showShare
          />
        </Card>
      </div>

      {data.failedSources.length > 0 && (
        <p className="text-xs text-amber-300">
          Sem resposta de {data.failedSources.map(sourceLabel).join(", ")}{" "}
          agora: os números estão incompletos.
        </p>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: React.ReactNode;
}) {
  return (
    <section className="cine-glass flex flex-col gap-1 rounded-2xl p-5">
      <h2 className="text-sm text-zinc-400">{label}</h2>
      <span className="text-4xl font-semibold tabular-nums tracking-tight">
        {value}
      </span>
      <span className="text-xs text-zinc-500">{note}</span>
    </section>
  );
}

/** Seta e sinal, não só cor: a direção se lê sem distinguir vermelho de verde. */
function Trend({ now, before }: { now: number; before: number }) {
  const diff = now - before;

  if (diff === 0) {
    return <>igual às 24 h anteriores ({before})</>;
  }

  return (
    <>
      <span className={diff > 0 ? "text-emerald-400" : "text-red-400"}>
        {diff > 0 ? "▲ +" : "▼ "}
        {diff}
      </span>{" "}
      vs. 24 h anteriores ({before})
    </>
  );
}

function Card({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`cine-glass flex min-w-0 flex-col gap-4 rounded-2xl p-5 ${className}`}
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-zinc-400">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Barras horizontais em ordem, com o número ao lado: comparar tamanhos é o
 * que a barra faz melhor que a pizza, e o rótulo longo cabe na linha.
 */
function Ranked({
  rows,
  total,
  showShare = false,
}: {
  rows: { key: string; label: string; count: number; color?: string }[];
  total?: number;
  showShare?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">Nenhuma vaga no período.</p>;
  }

  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <ol className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-zinc-200" title={row.label}>
              {row.label}
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="font-medium text-zinc-100">{row.count}</span>
              {showShare && total ? (
                <span className="w-9 text-right text-xs text-zinc-500">
                  {Math.round((row.count / total) * 100)}%
                </span>
              ) : null}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.count / max) * 100}%`,
                background: row.color ?? "var(--series-single)",
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
