import { cn } from "@/lib/utils";
import { formatCOP } from "@/modules/core/formato/numeros";
import { coberturaBaja, textoDias } from "../lib/inventario";
import type { ValorACosto } from "../queries/inventario.queries";

/** Formato de libras con miles («1.140 lb»); las libras de una presentación son múltiplos de 0,5: se muestra 1 decimal solo si hace falta. */
export const textoLibras = (lb: number): string => `${lb.toLocaleString("es-CO", { maximumFractionDigits: 1 })} lb`;

/**
 * Bloque 3 · Producto terminado listo para vender: libras disponibles, cobertura en días (rojo bajo el umbral) y valor a costo.
 * «Valor a costo» sale del costo por libra de los lotes (B-13); si algún producto no tiene costo se avisa.
 */
export function ResumenProductoTerminado({ libras, cobertura, umbralDias, valor }: { libras: number; cobertura: number | null; umbralDias: number; valor: ValorACosto | null }) {
  return (
    <section aria-labelledby="inv-pt" className="rounded-lg border-2 border-stone-800 bg-white p-4">
      <h3 id="inv-pt" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        3 · Producto terminado · listo para vender
      </h3>
      <dl className="mt-3 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-800">Libras disponibles</dt>
          <dd className="text-lg font-bold tabular-nums text-gray-900">{textoLibras(libras)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-800">Cobertura</dt>
          <dd className={cn("text-lg font-bold tabular-nums", coberturaBaja(cobertura, umbralDias) ? "text-red-700" : "text-gray-900")}>{textoDias(cobertura)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-gray-500">
        Valor a costo {valor === null || (valor.total === 0 && !valor.completo) ? "—" : formatCOP(valor.total)}
        {valor && !valor.completo && valor.total > 0 ? " (parcial: falta el costo de algún producto)" : ""} · 1 lb = 500 g
      </p>
    </section>
  );
}
