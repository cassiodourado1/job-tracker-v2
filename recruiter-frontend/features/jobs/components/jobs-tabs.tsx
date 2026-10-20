"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegação entre as duas telas da seção. Sem ela, salvar uma vaga não indica
 * para onde ela foi — e a única forma de chegar às salvas era digitar a URL.
 *
 * Pílulas, e não sublinhado, para não competir com a navegação principal: são
 * dois níveis diferentes, e ficar igual confundiria qual está ativa.
 *
 * Fixa logo abaixo do cabeçalho ao rolar: com centenas de cards, voltar ao
 * topo para trocar de aba custava uma rolagem inteira. O vidro e as margens
 * negativas cobrem a largura do conteúdo, para os cards passarem por baixo
 * sem aparecer entre as pílulas.
 */
export function JobsTabs({ savedCount }: { savedCount: number }) {
  const pathname = usePathname();

  const tabs = [
    { href: "/vagas", label: "Buscar", count: null as number | null },
    { href: "/vagas/salvas", label: "Minhas vagas", count: savedCount },
  ];

  return (
    <nav
      aria-label="Vagas"
      className="sticky top-16 z-30 -mx-6 -mt-3 flex items-center gap-1 border-b border-white/5 bg-zinc-950/90 px-6 py-3 backdrop-blur-xl backdrop-saturate-150"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            }`}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-xs ${
                  active
                    ? "bg-white/20 dark:bg-zinc-900/20"
                    : "bg-zinc-200 dark:bg-zinc-700"
                }`}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
