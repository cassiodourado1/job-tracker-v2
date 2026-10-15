"use client";

import { useState } from "react";
import type { DashboardWindow, JobsDashboard } from "@recruit/shared";
import {
  otherSources,
  seriesOf,
  seriesOrder,
  sourceColor,
  sourceLabel,
} from "@/features/market/sources";

/**
 * Vagas publicadas por hora (24h) ou por dia (7 e 30 dias), empilhadas por
 * fonte.
 *
 * SVG à mão, como os gráficos de Métricas. Barra empilhada porque a pergunta
 * é "quanto chegou em cada dia, e de onde" — o total é a altura, a fonte é a
 * cor. O número de cada barra fica no tooltip; só o maior dia leva rótulo,
 * para não virar uma fileira de números.
 */

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 18, right: 4, bottom: 22, left: 4 };
/** Espaço entre segmentos e entre barras, na cor do fundo. */
const GAP = 2;
const RADIUS = 4;

export function TimelineChart({
  timeline,
  window,
}: {
  timeline: JobsDashboard["timeline"];
  window: DashboardWindow;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const rows = timeline.map((bucket) => {
    const bySeries: Record<string, number> = {};

    for (const [source, count] of Object.entries(bucket.bySource)) {
      const series = seriesOf(source);

      bySeries[series] = (bySeries[series] ?? 0) + count;
    }

    return { key: bucket.key, total: bucket.total, bySeries };
  });

  const allSources = timeline.flatMap((bucket) => Object.keys(bucket.bySource));
  const series = seriesOrder(allSources.map(seriesOf));
  const others = [...new Set(otherSources(allSources))];
  const max = Math.max(1, ...rows.map((row) => row.total));
  const peak = rows.findIndex((row) => row.total === max);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const slot = innerW / rows.length;
  const barW = Math.max(2, slot - GAP * 2);
  const y = (value: number) => (value / max) * innerH;
  const hourly = window === "24h";
  // Rótulo a cada N barras: 24 horas ou 30 dias não cabem todos.
  const labelEvery = rows.length > 14 ? Math.ceil(rows.length / 8) : 1;

  const active = hover === null ? null : rows[hover];

  return (
    <div className="flex flex-col gap-3">
      {series.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
          {series.map((name) => (
            <li key={name} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ background: sourceColor(name) }}
              />
              {sourceLabel(name)}
              {name === "outras" && others.length > 0 && (
                <span className="text-zinc-500">({others.join(", ")})</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          role="img"
          aria-label={`Vagas publicadas por ${hourly ? "hora" : "dia"}, por fonte`}
          onPointerLeave={() => setHover(null)}
        >
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + innerH}
            y2={PAD.top + innerH}
            className="stroke-zinc-700"
            strokeWidth={1}
          />

          {rows.map((row, index) => {
            const x = PAD.left + index * slot + GAP;
            let base = PAD.top + innerH;
            const present = series.filter((name) => row.bySeries[name]);

            return (
              <g key={row.key}>
                {present.map((name, position) => {
                  const height = y(row.bySeries[name]);
                  const top = position === present.length - 1;
                  // O vão entre segmentos sai da altura do de cima, para a
                  // altura total continuar proporcional ao número.
                  const drawn = Math.max(1, height - (position > 0 ? GAP : 0));
                  const segment = segmentPath(x, base - drawn, barW, drawn, top);

                  base -= height;

                  return (
                    <path
                      key={name}
                      d={segment}
                      fill={sourceColor(name)}
                      opacity={hover === null || hover === index ? 1 : 0.45}
                    />
                  );
                })}

                {index === peak && row.total > 0 && (
                  <text
                    x={x + barW / 2}
                    y={PAD.top + innerH - y(row.total) - 5}
                    textAnchor="middle"
                    className="fill-zinc-300 text-[11px] tabular-nums"
                  >
                    {row.total}
                  </text>
                )}

                {index % labelEvery === 0 && (
                  <text
                    x={x + barW / 2}
                    y={HEIGHT - 6}
                    textAnchor="middle"
                    className="fill-zinc-500 text-[10px]"
                  >
                    {shortLabel(row.key, hourly)}
                  </text>
                )}

                {/* Alvo do hover: a coluna inteira, não só a barra. */}
                <rect
                  x={PAD.left + index * slot}
                  y={PAD.top}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  onPointerEnter={() => setHover(index)}
                />
              </g>
            );
          })}
        </svg>

        {active && hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${((hover + 0.5) / rows.length) * 100}%`,
              transform: `translateX(${hover > rows.length / 2 ? "-105%" : "5%"})`,
            }}
          >
            <div className="mb-1 font-medium text-zinc-100">
              {longLabel(active.key, hourly)} · {active.total}{" "}
              {active.total === 1 ? "vaga" : "vagas"}
            </div>
            {series
              .filter((name) => active.bySeries[name])
              .map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-3 text-zinc-300"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 rounded-sm"
                      style={{ background: sourceColor(name) }}
                    />
                    {sourceLabel(name)}
                  </span>
                  <span className="tabular-nums">{active.bySeries[name]}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      <details className="text-xs text-zinc-400">
        <summary className="cursor-pointer">Ver tabela</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="py-1 font-medium">{hourly ? "Hora" : "Dia"}</th>
              {series.map((name) => (
                <th key={name} className="py-1 text-right font-medium">
                  {sourceLabel(name)}
                </th>
              ))}
              <th className="py-1 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-zinc-800">
                <td className="py-1">{longLabel(row.key, hourly)}</td>
                {series.map((name) => (
                  <td key={name} className="py-1 text-right">
                    {row.bySeries[name] ?? 0}
                  </td>
                ))}
                <td className="py-1 text-right text-zinc-200">{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Retângulo; o segmento do topo ganha cantos arredondados em cima. */
function segmentPath(
  x: number,
  y: number,
  w: number,
  h: number,
  roundTop: boolean,
): string {
  const r = roundTop ? Math.min(RADIUS, w / 2, h) : 0;

  return [
    `M${x},${y + h}`,
    `V${y + r}`,
    r ? `Q${x},${y} ${x + r},${y}` : "",
    `H${x + w - r}`,
    r ? `Q${x + w},${y} ${x + w},${y + r}` : "",
    `V${y + h}`,
    "Z",
  ].join(" ");
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-10-15" → "15/10"; "2026-10-15T14" → "14h". */
function shortLabel(key: string, hourly: boolean): string {
  if (hourly) {
    return `${key.slice(11, 13)}h`;
  }

  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** Para o tooltip e a tabela: "qui 15/10" ou "15/10 14h". */
function longLabel(key: string, hourly: boolean): string {
  const day = `${key.slice(8, 10)}/${key.slice(5, 7)}`;

  if (hourly) {
    return `${day} ${key.slice(11, 13)}h`;
  }

  // Meio-dia UTC: o dia da semana não escorrega por fuso.
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();

  return `${WEEKDAYS[weekday]} ${day}`;
}
