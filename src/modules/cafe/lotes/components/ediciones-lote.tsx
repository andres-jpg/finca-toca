import { etiquetaCampo, valorLegible } from "../edicion/edicion";
import { fechaHoraZona } from "../lib/formato";
import { getEdicionesLote } from "../queries/edicion.queries";

/**
 * Correcciones hechas al lote (A-18 · FIN-136): campo · antes → después · usuario · fecha/hora · motivo. Componente propio
 * para que la Historia del lote (A-17) lo integre donde quiera; mientras tanto la ficha lo muestra como sección.
 */
export async function EdicionesLote({ loteId, zona }: { loteId: string; zona: string }) {
  const ediciones = await getEdicionesLote(loteId);
  if (ediciones.length === 0) return null;
  return (
    <section className="space-y-2" aria-labelledby="titulo-ediciones">
      <h2 id="titulo-ediciones" className="text-lg font-semibold text-gray-800">
        Correcciones al lote
      </h2>
      <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {ediciones.map((e, i) => (
          <li key={`${e.edicionId}-${i}`} className="space-y-0.5 px-3 py-2 text-sm">
            <p className="text-gray-800">
              {e.referencia && e.entidad !== "lote" ? <span className="text-gray-500">{e.referencia} · </span> : null}
              <span className="font-medium">{etiquetaCampo(e.campo)}</span>: {valorLegible(e.campo, e.antes, zona)} → {valorLegible(e.campo, e.despues, zona)}
            </p>
            <p className="text-xs text-gray-500">
              {e.por ?? "Sistema"} · {fechaHoraZona(e.en, zona)} · Motivo: {e.motivo}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
