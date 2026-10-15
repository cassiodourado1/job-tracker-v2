/**
 * A primeira abertura consulta os portais e leva uns segundos; sem isto a
 * tela anterior ficava parada, parecendo que o clique não pegou.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-6xl flex-col gap-5"
    >
      <span className="text-sm text-zinc-400">Consultando os portais…</span>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
