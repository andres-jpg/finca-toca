import { MermaBadge } from "../../components/merma-badge";
import { formatKg, formatPct } from "@/modules/core/formato/numeros";
import type { MermaProcesada } from "../lib/etapas";
import type { TipoProceso } from "../types";

function Tarjeta({ etiqueta, children, nota }: { etiqueta: string; children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{etiqueta}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{children}</dd>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
    </div>
  );
}

interface Props {
  esServicio: boolean;
  recibidoKg: number;
  /** `null` = el lote no pasa por tostión: no hay tarjeta. */
  tostadoKg: number | null;
  merma: MermaProcesada | null;
  /** Para el badge: solo si la merma es de un único paso (tostión), con la referencia que rigió. */
  referencia: { pct: number; referenciaPct: number | null; toleranciaPts: number | null; tipo: TipoProceso } | null;
  /** `null` = no aplica (servicios a terceros). */
  granelKg: number | null;
  /** `null` = el lote no pasa por tostión. */
  sinTostarKg: number | null;
}

/** Cifras clave del lote: cada una es de un solo concepto; no hay un «disponible» que mezcle verde, tostado y empacado. */
export function CifrasLote({ esServicio, recibidoKg, tostadoKg, merma, referencia, granelKg, sinTostarKg }: Props) {
  return (
    <section aria-labelledby="titulo-cifras" className="space-y-2">
      <h2 id="titulo-cifras" className="text-lg font-semibold text-gray-800">
        Cifras clave
      </h2>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tarjeta etiqueta={esServicio ? "Recibido" : "Comprado"}>{formatKg(recibidoKg)}</Tarjeta>
        {tostadoKg !== null && <Tarjeta etiqueta="Tostado">{formatKg(tostadoKg)}</Tarjeta>}
        <Tarjeta
          etiqueta="Merma"
          nota={merma ? `sobre ${formatKg(merma.entradaKg)} procesados` : "aún no se procesa nada"}
        >
          {merma ? formatPct(merma.pct) : "—"}
          {merma && referencia && (
            <div className="mt-1 text-sm font-normal">
              <MermaBadge
                mermaPct={referencia.pct}
                referenciaPct={referencia.referenciaPct}
                toleranciaPts={referencia.toleranciaPts}
                tipo={referencia.tipo}
                conAyuda={false}
              />
            </div>
          )}
        </Tarjeta>
        {granelKg !== null && <Tarjeta etiqueta="A granel" nota="tostado sin empacar">{formatKg(granelKg)}</Tarjeta>}
        {sinTostarKg !== null && <Tarjeta etiqueta="Sin tostar">{formatKg(sinTostarKg)}</Tarjeta>}
      </dl>
    </section>
  );
}
