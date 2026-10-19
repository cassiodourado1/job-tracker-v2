import type { ReactNode } from "react";
import { MainNav } from "@/components/layout/main-nav";

interface AppShellProps {
  /** SVG já renderizado no servidor. */
  avatar: string;
  name: string;
  headline: string | null;
  onSwitch: () => void;
  children: ReactNode;
}

/**
 * Casca do app: identidade ativa, navegação e área de conteúdo.
 *
 * Recebe strings, não um `Profile`. É o que a mantém em `components/` sem
 * quebrar a regra: componente que *recebe* dado de domínio continua genérico;
 * o que *busca* dado de domínio pertence a uma feature.
 */
export function AppShell({
  avatar,
  name,
  headline,
  onSwitch,
  children,
}: AppShellProps) {
  return (
    <div data-shell className="flex flex-1 flex-col">
      {/*
        Um cabeçalho só, com a navegação dentro. Antes eram duas faixas
        empilhadas — identidade em cima, menu embaixo —, e as duas juntas
        comiam altura sem ocupar a largura.

        Fixo no topo e em vidro: o conteúdo passa por baixo e a cena de fundo
        continua visível através dele.

        Fora do PDF: o cabeçalho do app não pertence a um currículo.
      */}
      <header
        data-print-hide
        className="sticky top-0 z-40 border-b border-white/5 bg-zinc-950/55 backdrop-blur-xl backdrop-saturate-150"
      >
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-6 px-6">
          <span className="flex shrink-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-zinc-950 shadow-[0_0_24px_-4px] shadow-accent/60"
            >
              JT
            </span>
            <span className="hidden font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight lg:inline">
              Job Tracker
            </span>
          </span>

          <MainNav />

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span
              aria-hidden
              className="h-8 w-8 overflow-hidden rounded-full ring-1 ring-white/10 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: avatar }}
            />
            {/* Largura limitada: o título que vem do currículo importado
                pode ter uma linha inteira, e empurrava o menu para fora da
                tela. O texto completo fica no `title`. */}
            <div className="hidden max-w-56 min-w-0 flex-col leading-tight md:flex">
              <span className="truncate text-sm font-medium" title={name}>
                {name}
              </span>
              {headline && (
                <span
                  className="truncate text-xs text-zinc-400"
                  title={headline}
                >
                  {headline}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onSwitch}
              className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium transition hover:border-white/20 hover:bg-white/10"
            >
              Trocar perfil
            </button>
          </div>
        </div>
      </header>

      {/*
        Largura de verdade: antes a maioria das telas parava em ~900 px, e num
        monitor largo mais da metade da tela ficava vazia.
      */}
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-6 py-8 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
