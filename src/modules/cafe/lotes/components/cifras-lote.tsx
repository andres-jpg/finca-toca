import { MermaBadge } from "../../components/merma-badge";
import { formatKg, formatPct } from "@/modules/core/formato/numeros";
import { textoTandas } from "../lib/cifras";
import type { MermaProcesada } from "../lib/etapas";
import type { TipoProceso } from "../types";

function Tarjeta({ etiqueta, children, nota }: { etiqueta: string; children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <dt className="text-xs font-medium text-gray-500">{etiqueta}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{children}</dd>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
    </div>
  );
}

interface Props {
  esServicio: boolean;
  recibidoKg: number;
  /** «$28.500/kg · $9.120.000» (marca propia). */
  notaCompra: string | null;
  /** Kilos que ya entraron a tostión y tandas; `null` = el lote no pasa por tostión. */
  procesado: { kg: number; tandas: number } | null;
  /** Merma de tostión acumulada (o de la trilla si el lote no tuesta); `null` = aún no hay tanda cerrada. */
  merma: MermaProcesada | null;
  conTostion: boolean;
  referencia: { pct: number; referenciaPct: number | null; toleranciaPts: number | null; tipo: TipoProceso } | null;
  /** `null` = no aplica (servicios a terceros). */
  granelKg: number | null;
  /** `null` = el lote no pasa por tostión. */
  sinTostarKg: number | null;
}

/** Cifras clave del lote: cada una es de un solo concepto; no hay un «disponible» que mezcle verde, tostado y empacado. */
export function CifrasLote({ esServicio, recibidoKg, notaCompra, procesado, merma, conTostion, referencia, granelKg, sinTostarKg }: Props) {
  return (
    <section aria-labelledby="titulo-cifras" className="space-y-2">
      <h2 id="titulo-cifras" className="sr-only">
        Cifras clave
      </h2>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tarjeta etiqueta={esServicio ? "Recibido" : "Comprado"} nota={notaCompra}>
          {formatKg(recibidoKg)}
        </Tarjeta>
        {procesado && (
          <Tarjeta etiqueta="Procesado" nota={textoTandas(procesado.tandas)}>
            {formatKg(procesado.kg)}
          </Tarjeta>
        )}
        <Tarjeta
          etiqueta={conTostion ? "Merma de tostión" : "Merma"}
          nota={
            merma ? (
              <>
                acumulada
                {referencia && (
                  <>
                    {" · "}
                    <MermaBadge
                      mermaPct={referencia.pct}
                      referenciaPct={referencia.referenciaPct}
                      toleranciaPts={referencia.toleranciaPts}
                      tipo={referencia.tipo}
                      conAyuda={false}
                    />
                  </>
                )}
              </>
            ) : (
              "aún no hay tandas empacadas"
            )
          }
        >
          {merma ? formatPct(merma.pct) : "—"}
        </Tarjeta>
        {granelKg !== null && (
          <Tarjeta etiqueta="Tostado sin empacar" nota="sobrantes acumulados">
            {formatKg(granelKg)}
          </Tarjeta>
        )}
        {sinTostarKg !== null && (
          <Tarjeta etiqueta="Por tostar" nota="café verde">
            {formatKg(sinTostarKg)}
          </Tarjeta>
        )}
      </dl>
    </section>
  );
}
