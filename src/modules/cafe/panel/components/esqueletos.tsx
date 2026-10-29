/** Marcadores de carga de cada sección del panel: ocupan el sitio de lo que llega para que la página no salte. */
export function EsqueletoTarjetas() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(15.5rem,1fr))] gap-3" aria-busy>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-lg border border-stone-200 bg-white" />
      ))}
    </div>
  );
}

export function EsqueletoInventario() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] gap-3" aria-busy>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-lg border border-stone-200 bg-white" />
      ))}
    </div>
  );
}

export function EsqueletoGraficos() {
  return (
    <div className="grid gap-3 xl:grid-cols-2" aria-busy>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={`h-72 animate-pulse rounded-xl border border-stone-200 bg-white ${i === 2 ? "xl:col-span-2" : ""}`} />
      ))}
    </div>
  );
}

export function EsqueletoResumen() {
  return <div className="h-56 animate-pulse rounded-lg border border-stone-200 bg-white" aria-busy />;
}
