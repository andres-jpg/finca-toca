import { cn } from "@/lib/utils";
import { enteroConMiles } from "../../empaque/lib/empaque";
import type { MatrizProductoTerminado } from "../../empaque/lib/matriz";
import { formatearKg3 } from "../../lotes/lib/formato";
import { etiquetaPresentacion } from "../../tipos/lib/productos";

/**
 * La matriz tipo de café × presentación de CO-30, en versión de solo lectura para el panel (sin kardex ni salidas, que
 * viven en `/dashboard/cafe/inventario`). Sale de `construirMatriz()` y `getMatrizProductoTerminado()`: es la misma
 * regla, no una copia. Unidades en rojo si son negativas; nunca hay un total que mezcle tipos o presentaciones.
 */
export function MatrizProductoCompacta({ matriz }: { matriz: MatrizProductoTerminado }) {
  if (matriz.filas.length === 0 || matriz.presentaciones.length === 0) {
    return <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500">Aún no hay productos terminados.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-stone-200">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Tipo
            </th>
            {matriz.presentaciones.map((g) => (
              <th key={g} scope="col" className="px-3 py-2 text-right font-semibold">
                {etiquetaPresentacion(g)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {matriz.filas.map((fila) => (
            <tr key={fila.tipoCafeId}>
              <th scope="row" className="px-3 py-2 text-left font-semibold text-gray-800">
                {fila.tipoCafe}
              </th>
              {matriz.presentaciones.map((g) => {
                const celda = fila.celdas[g];
                if (!celda) {
                  return (
                    <td key={g} className="px-3 py-2 text-right text-gray-400">
                      —
                    </td>
                  );
                }
                const negativo = celda.producto.stock < 0;
                return (
                  <td key={g} className={cn("px-3 py-2 text-right", !celda.producto.activo && "opacity-60")}>
                    <span className={cn("block text-base font-bold tabular-nums", negativo ? "text-red-700" : "text-gray-900")}>
                      {enteroConMiles(celda.producto.stock)} <span className="text-xs font-normal text-gray-500">u</span>
                    </span>
                    <span className={cn("block text-xs tabular-nums", negativo ? "text-red-700" : "text-gray-500")}>≈ {formatearKg3(celda.kg)} kg</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
