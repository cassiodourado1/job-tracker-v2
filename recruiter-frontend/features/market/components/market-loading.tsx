/**
 * A primeira abertura consulta os portais e leva uns segundos; sem isto a
 * tela ficava em branco, parecendo que nada acontecia.
 */
export function MarketLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full flex-col gap-6"
    >
      <span className="text-sm text-zinc-400">Consultando os portais…</span>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            aria-hidden
            className="cine-glass h-28 animate-pulse rounded-2xl"
          />
        ))}
      </div>
      <div aria-hidden className="cine-glass h-72 animate-pulse rounded-2xl" />
    </div>
  );
}
