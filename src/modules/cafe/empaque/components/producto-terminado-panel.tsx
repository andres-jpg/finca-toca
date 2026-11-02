"use client";

import { COPY } from "../../copy";
import { useMemo, useState } from "react";
import { LogOut, Repeat2, ScrollText } from "lucide-react";
import { EntityModal } from "@/components/shared/entity-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StockBadge } from "@/modules/core/inventario/components/stock-badge";
import { formatearKg3 } from "../../lotes/lib/formato";
import { etiquetaPresentacion } from "../../tipos/lib/productos";
import { enteroConMiles } from "../lib/empaque";
import type { MatrizProductoTerminado, ProductoTerminado } from "../lib/matriz";
import { ConvertirPresentacionForm, type SaldoConvertibleVista } from "./convertir-presentacion-form";
import { KardexProductoDialog } from "./kardex-producto-dialog";
import { SalidaPtForm } from "./salida-pt-form";

interface ProductoTerminadoPanelProps {
  matriz: MatrizProductoTerminado;
  productos: ProductoTerminado[];
  /** owner/admin/operativo: registran muestras y pérdidas. Un viewer (Gerencia) solo consulta. */
  puedeRegistrarSalida: boolean;
  /** owner/admin: además ajustan. Es solo la UI; la acción y la RPC lo vuelven a exigir. */
  puedeAjustar: boolean;
  zonaHoraria: string;
  /** Unidades convertibles por lote y producto (A-15). */
  saldosConvertibles: SaldoConvertibleVista[];
  /** `YYYY-MM-DD` de hoy en la zona del cliente. */
  fechaHoy: string;
}

type Dialogo = { tipo: "salida"; articuloId: string | null } | { tipo: "convertir" } | null;

/**
 * Producto terminado por tipo de café × presentación (HU-F1-06 c2): una matriz, nunca un total mezclado. Cada
 * celda muestra las unidades disponibles (en rojo si son negativas), su equivalencia en kg y el acceso al kardex.
 * Las entradas llegan solo por empaque; aquí solo se registran las salidas manuales.
 */
export function ProductoTerminadoPanel({ matriz, productos, puedeRegistrarSalida, puedeAjustar, zonaHoraria, saldosConvertibles, fechaHoy }: ProductoTerminadoPanelProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [kardex, setKardex] = useState<{ articuloId: string; nombre: string } | null>(null);
  const activos = useMemo(() => productos.filter((p) => p.activo), [productos]);
  const cerrar = () => setDialogo(null);
  // El inventario de marca propia va por calidad × presentación × forma (A-02): primero las columnas de grano, luego las de molido.
  const columnas = [
    ...matriz.presentaciones.map((g) => ({ g, forma: "grano" as const })),
    ...matriz.presentacionesMolido.map((g) => ({ g, forma: "molido" as const })),
  ];

  return (
    <section className="space-y-4" aria-labelledby="pt-titulo">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 id="pt-titulo" className="text-xl font-bold tracking-tight text-gray-800 sm:text-2xl">
            {COPY.inventarioMarcaPropia}
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Unidades por tipo de café, presentación y forma (grano o molido) · solo aumentan al empacar un lote
            {!puedeRegistrarSalida && " · solo lectura"}
          </p>
        </div>
        {puedeRegistrarSalida && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDialogo({ tipo: "convertir" })} className="h-11 w-full sm:w-auto" disabled={saldosConvertibles.length === 0}>
              <Repeat2 className="mr-2 h-4 w-4" />
              Convertir presentación
            </Button>
            <Button onClick={() => setDialogo({ tipo: "salida", articuloId: null })} className="h-11 w-full sm:w-auto" disabled={activos.length === 0}>
              <LogOut className="mr-2 h-4 w-4" />
              Registrar salida
            </Button>
          </div>
        )}
      </div>

      {matriz.filas.length === 0 || matriz.presentaciones.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          Aún no hay productos terminados. Se crean solos al tener un tipo de café activo y una bolsa de cada tamaño en Insumos.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Tipo de café
                </th>
                {columnas.map((c) => (
                  <th key={`${c.forma}:${c.g}`} scope="col" className="px-4 py-3 text-right font-semibold">
                    {etiquetaPresentacion(c.g)}
                    {matriz.presentacionesMolido.length > 0 && <span className="block text-[11px] font-normal normal-case text-gray-500">{c.forma === "molido" ? "Molido" : "Grano"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {matriz.filas.map((fila) => (
                <tr key={fila.tipoCafeId}>
                  <th scope="row" className="px-4 py-3 text-left text-base font-semibold text-gray-800">
                    {fila.tipoCafe}
                  </th>
                  {columnas.map(({ g, forma }) => {
                    const celda = (forma === "molido" ? fila.celdasMolido : fila.celdas)[g];
                    if (!celda) {
                      return (
                        <td key={`${forma}:${g}`} className="px-4 py-3 text-right text-gray-400">
                          —
                        </td>
                      );
                    }
                    const { producto, kg } = celda;
                    return (
                      <td key={`${forma}:${g}`} className={cn("px-4 py-3", !producto.activo && "opacity-60")}>
                        <div className="flex items-center justify-end gap-3">
                          <div className="text-right">
                            <p className={cn("text-xl font-bold tabular-nums", producto.stock < 0 ? "text-red-700" : "text-gray-900")}>
                              {enteroConMiles(producto.stock)} <span className="text-xs font-normal text-gray-500">u</span>
                            </p>
                            <p className={cn("text-xs tabular-nums", producto.stock < 0 ? "text-red-700" : "text-gray-500")}>
                              ≈ {formatearKg3(kg)} kg
                            </p>
                            {producto.stock < 0 ? (
                              <StockBadge stock={producto.stock} stockMinimo={null} className="mt-1" />
                            ) : producto.stock === 0 ? (
                              <span className="mt-1 inline-block rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800">Agotado</span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => setKardex({ articuloId: producto.articuloId, nombre: producto.nombre })}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                            title="Ver kardex"
                            aria-label={`Ver kardex de ${producto.nombre}`}
                          >
                            <ScrollText className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EntityModal open={dialogo?.tipo === "salida"} onClose={cerrar} title="Registrar salida de producto terminado">
        {dialogo?.tipo === "salida" && (
          <SalidaPtForm productos={activos} articuloInicial={dialogo.articuloId} puedeAjustar={puedeAjustar} onSuccess={cerrar} />
        )}
      </EntityModal>

      <EntityModal open={dialogo?.tipo === "convertir"} onClose={cerrar} title="Convertir presentación">
        {dialogo?.tipo === "convertir" && <ConvertirPresentacionForm productos={activos} saldos={saldosConvertibles} fechaHoy={fechaHoy} onSuccess={cerrar} />}
      </EntityModal>

      <KardexProductoDialog producto={kardex} zonaHoraria={zonaHoraria} onClose={() => setKardex(null)} />
    </section>
  );
}
