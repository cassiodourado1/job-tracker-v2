import Link from "next/link";
import type { ReactNode } from "react";
import { CountUp, Tilt } from "@/components/motion";

/**
 * Os blocos dos painéis (Métricas e Mercado). Vivem aqui, e não em cada
 * tela, para as duas não se desencontrarem: são a mesma ideia — números de
 * cabeça e gráficos em vidro — e devem ter a mesma cara.
 */

/** Cabeçalho do painel: título, linha de contexto e, à direita, controles. */
export function DashboardHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-sm text-zinc-400">{subtitle}</p>
      </div>
      {actions}
    </header>
  );
}

/**
 * Um bloco do painel: vidro sobre a cena, entrando em cascata.
 *
 * Sem `Tilt` de propósito. Inclinar um bloco com gráfico faz o gráfico
 * inteiro balançar sob o cursor — justamente quando você está tentando ler um
 * ponto dele. Os tiles, que são um número só, inclinam; os gráficos não.
 */
export function Panel({
  index,
  title,
  subtitle,
  className = "",
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`cine-reveal cine-glass flex min-w-0 flex-col gap-4 rounded-2xl p-6 ${className}`}
      style={{ ["--i" as string]: index }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Um número de cabeça. Com `href`, o tile inteiro leva ao que ele contou. */
export function Tile({
  index,
  label,
  value,
  hint,
  href,
}: {
  index: number;
  label: string;
  value: number;
  hint?: ReactNode;
  href?: string;
}) {
  const body = (
    <div className="cine-glass flex h-full flex-col gap-1 rounded-2xl px-5 py-4">
      <CountUp
        value={value}
        className="font-[family-name:var(--font-display)] text-3xl font-semibold"
      />
      <span className="text-xs font-medium text-zinc-300">{label}</span>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </div>
  );

  return (
    <div className="cine-reveal" style={{ ["--i" as string]: index }}>
      <Tilt className="h-full rounded-2xl" max={10}>
        {href ? (
          <Link
            href={href}
            title="Ver estas vagas"
            className="block h-full rounded-2xl transition hover:ring-1 hover:ring-zinc-600"
          >
            {body}
          </Link>
        ) : (
          body
        )}
      </Tilt>
    </div>
  );
}
