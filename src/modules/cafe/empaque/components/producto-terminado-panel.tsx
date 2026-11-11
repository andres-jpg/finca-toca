"use client";

import { useMemo, useState } from "react";
import { LogOut, ScrollText } from "lucide-react";
import { EntityModal } from "@/components/shared/entity-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StockBadge } from "@/modules/core/inventario/components/stock-badge";
import { coberturaBaja, textoDias, type FilaProductoTerminado } from "../../inventario/lib/inventario";
import { textoLibras } from "../../inventario/components/resumen-producto-terminado";
import { etiquetaPresentacion } from "../../tipos/lib/productos";
import { enteroConMiles } from "../lib/empaque";
import type { ProductoTerminado } from "../lib/matriz";
import { KardexProductoDialog } from "./kardex-producto-dialog";
import { SalidaPtForm } from "./salida-pt-form";

interface ProductoTerminadoPanelProps {
  /** Una fila por tipo de café × presentación (grano y molido), con libras y cobertura. */
  filas: FilaProductoTerminado[];
  productos: ProductoTerminado[];
  /** owner/admin/operativo: registran muestras y pérdidas. Un viewer (Gerencia) solo consulta. */
  puedeRegistrarSalida: boolean;
  zonaHoraria: string;
  /** Cobertura bajo estos días se pinta en rojo (`cafe.cobertura_minima_dias`). */
  umbralDias: number;
}

type Dialogo = { tipo: "salida" } | null;

/** Unidades de un producto: «0 · agotado» en rojo, negativas en rojo, y el acceso a su kardex. */
function Celda({ producto, onKardex }: { producto: FilaProductoTerminado["grano"]; onKardex: (a: { articuloId: string; nombre: string }) => void }) {
  if (!producto) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex items-center justify-end gap-1">
      {producto.unidades === 0 ? (
        <span className="rounded-md bg-red-100 px-2 py-0.5 font-medium text-red-800">0 · agotado</span>
      ) : producto.unidades < 0 ? (
        <StockBadge stock={producto.unidades} stockMinimo={null} />
      ) : (
        <span className="font-semibold tabular-nums text-gray-900">{enteroConMiles(producto.unidades)}</span>
      )}
      <button
        type="button"
        onClick={() => onKardex({ articuloId: producto.articuloId, nombre: producto.nombre })}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800"
        title="Ver kardex"
        aria-label={`Ver kardex de ${producto.nombre}`}
      >
        <ScrollText className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Producto terminado · listo para vender (B-10): una fila por tipo de café y presentación con las unidades en grano y en molido,
 * las libras y para cuántos días alcanza. Nunca hay un total que mezcle filas. Las entradas llegan solo por empaque (o carga
 * inicial); aquí solo se registran salidas manuales (muestra, pérdida); ajustar y convertir están en la cabecera.
 */
export function ProductoTerminadoPanel({ filas, productos, puedeRegistrarSalida, zonaHoraria, umbralDias }: ProductoTerminadoPanelProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [kardex, setKardex] = useState<{ articuloId: string; nombre: string } | null>(null);
  const activos = useMemo(() => productos.filter((p) => p.activo), [productos]);
  const cerrar = () => setDialogo(null);

  return (
    <section className="space-y-3" aria-labelledby="pt-titulo">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h2 id="pt-titulo" className="text-lg font-semibold tracking-tight text-gray-800">
          Producto terminado · listo para vender
        </h2>
        {puedeRegistrarSalida && (
          <Button variant="outline" onClick={() => setDialogo({ tipo: "salida" })} className="h-11 w-full sm:w-auto" disabled={activos.length === 0}>
            <LogOut className="mr-2 h-4 w-4" />
            Registrar salida
          </Button>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          Aún no hay productos terminados. Se crean solos al tener un tipo de café activo y una bolsa de cada tamaño en Insumos.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Producto terminado
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Grano · und
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Molido · und
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Libras
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Alcanza para
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filas.map((f) => (
                <tr key={f.clave} className={cn(!(f.grano?.activo ?? f.molido?.activo ?? true) && "opacity-60")}>
                  <th scope="row" className="px-4 py-3 text-left text-base font-semibold text-gray-800">
                    {f.tipoCafe} {etiquetaPresentacion(f.presentacionG)}
                  </th>
                  <td className="px-4 py-1 text-right">
                    <Celda producto={f.grano} onKardex={setKardex} />
                  </td>
                  <td className="px-4 py-1 text-right">
                    <Celda producto={f.molido} onKardex={setKardex} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{textoLibras(f.libras)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", coberturaBaja(f.cobertura, umbralDias) ? "text-red-700" : "text-gray-900")}>{textoDias(f.cobertura)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-500">
        La venta descuenta de esta tabla. Una presentación en cero no se puede vender. Las diferencias de conteo se corrigen con «Ajustar inventario», que exige motivo y queda registrado.
      </p>

      <EntityModal open={dialogo?.tipo === "salida"} onClose={cerrar} title="Registrar salida de producto terminado">
        {dialogo?.tipo === "salida" && (
          // El ajuste ya no se hace aquí: «Ajustar inventario» exige motivo y deja auditoría (B-15).
          <SalidaPtForm productos={activos} articuloInicial={null} puedeAjustar={false} onSuccess={cerrar} />
        )}
      </EntityModal>

      <KardexProductoDialog producto={kardex} zonaHoraria={zonaHoraria} onClose={() => setKardex(null)} />
    </section>
  );
}
