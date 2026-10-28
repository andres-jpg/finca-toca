"use client";

import { useMemo, useState } from "react";
import { Pencil, PackagePlus, Plus, Power, PowerOff, ScrollText, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { DeleteConfirmationDialog } from "@/components/shared/delete-confirmation-dialog";
import { EntityModal } from "@/components/shared/entity-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StockBadge } from "@/modules/core/inventario/components/stock-badge";
import { cn } from "@/lib/utils";
import { desactivarInsumo, reactivarInsumo } from "../actions/insumos.actions";
import { ETIQUETA_CLASE_PLURAL, agruparPorClase } from "../lib/insumos";
import type { InsumoEmpaque } from "../types";
import { etiquetaPresentacion } from "../../tipos/lib/productos";
import { AjusteInsumoForm } from "./ajuste-insumo-form";
import { CompraInsumoForm } from "./compra-insumo-form";
import { InsumoForm } from "./insumo-form";
import { KardexInsumoDialog } from "./kardex-insumo-dialog";

interface InsumosPanelProps {
  insumos: InsumoEmpaque[];
  /** owner/admin/operativo: registra compras. Un viewer (Gerencia) solo consulta. */
  puedeComprar: boolean;
  /** owner/admin: crea, edita mínimos, desactiva y ajusta. Es solo la UI; las acciones y el RLS lo vuelven a exigir. */
  puedeAdministrar: boolean;
  /** `YYYY-MM-DD` de hoy en la zona del cliente. */
  fechaHoy: string;
  zonaHoraria: string;
}

type Dialogo =
  | { tipo: "nuevo" }
  | { tipo: "compra" | "editar" | "ajuste" | "desactivar"; insumo: InsumoEmpaque }
  | null;

const BOTON = "inline-flex h-11 w-11 items-center justify-center rounded-md text-gray-400 transition-colors sm:h-9 sm:w-9";

/**
 * Insumos de empaque agrupados por clase (bolsas, etiquetas) con su stock, mínimo y estado. Un solo estado
 * de diálogo para toda la tabla: cada acción de una fila lo abre con su insumo.
 */
export function InsumosPanel({ insumos, puedeComprar, puedeAdministrar, fechaHoy, zonaHoraria }: InsumosPanelProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [kardex, setKardex] = useState<InsumoEmpaque | null>(null);
  const grupos = useMemo(() => agruparPorClase(insumos), [insumos]);
  const cerrar = () => setDialogo(null);

  async function cambiarActivo(insumo: InsumoEmpaque, activar: boolean) {
    const r = activar ? await reactivarInsumo(insumo.articulo_id) : await desactivarInsumo(insumo.articulo_id);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(activar ? "Insumo reactivado" : "Insumo desactivado");
    cerrar();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-800 sm:text-2xl">Insumos de empaque</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Bolsas y etiquetas por tamaño · {insumos.length} en total
            {!puedeComprar && " · solo lectura"}
          </p>
        </div>
        {puedeAdministrar && (
          <Button onClick={() => setDialogo({ tipo: "nuevo" })} className="h-11 w-full sm:h-9 sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo insumo
          </Button>
        )}
      </div>

      {grupos.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">
          Aún no hay insumos de empaque.{puedeAdministrar && " Crea el primero con «Nuevo insumo»."}
        </p>
      )}

      {grupos.map((grupo) => (
        <section key={grupo.clase} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            {ETIQUETA_CLASE_PLURAL[grupo.clase]}
          </h3>
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Presentación</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupo.insumos.map((insumo) => (
                  <TableRow key={insumo.articulo_id} className={cn(!insumo.activo && "opacity-60")}>
                    <TableCell className="font-medium text-gray-800">{insumo.nombre}</TableCell>
                    <TableCell>{etiquetaPresentacion(insumo.presentacionG)}</TableCell>
                    <TableCell>
                      <StockBadge stock={insumo.stock} stockMinimo={insumo.stock_minimo} unidad={insumo.unidad} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {insumo.stock_minimo === null ? "—" : insumo.stock_minimo.toLocaleString("es-CO")}
                    </TableCell>
                    <TableCell>
                      {insumo.activo ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Activo</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {puedeComprar && insumo.activo && (
                          <button
                            onClick={() => setDialogo({ tipo: "compra", insumo })}
                            className={cn(BOTON, "hover:bg-green-50 hover:text-green-700")}
                            title="Registrar compra"
                            aria-label={`Registrar compra de ${insumo.nombre}`}
                          >
                            <PackagePlus className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setKardex(insumo)}
                          className={cn(BOTON, "hover:bg-gray-100 hover:text-gray-700")}
                          title="Ver kardex"
                          aria-label={`Ver kardex de ${insumo.nombre}`}
                        >
                          <ScrollText className="h-4 w-4" />
                        </button>
                        {puedeAdministrar && (
                          <>
                            <button
                              onClick={() => setDialogo({ tipo: "editar", insumo })}
                              className={cn(BOTON, "hover:bg-gray-100 hover:text-gray-700")}
                              title="Editar nombre y mínimo"
                              aria-label={`Editar ${insumo.nombre}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            {insumo.activo && (
                              <button
                                onClick={() => setDialogo({ tipo: "ajuste", insumo })}
                                className={cn(BOTON, "hover:bg-amber-50 hover:text-amber-700")}
                                title="Ajustar stock"
                                aria-label={`Ajustar el stock de ${insumo.nombre}`}
                              >
                                <SlidersHorizontal className="h-4 w-4" />
                              </button>
                            )}
                            {insumo.activo ? (
                              <button
                                onClick={() => setDialogo({ tipo: "desactivar", insumo })}
                                className={cn(BOTON, "hover:bg-red-50 hover:text-red-600")}
                                title="Desactivar insumo"
                                aria-label={`Desactivar ${insumo.nombre}`}
                              >
                                <PowerOff className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => void cambiarActivo(insumo, true)}
                                className={cn(BOTON, "hover:bg-green-50 hover:text-green-600")}
                                title="Reactivar insumo"
                                aria-label={`Reactivar ${insumo.nombre}`}
                              >
                                <Power className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}

      <EntityModal open={dialogo?.tipo === "nuevo"} onClose={cerrar} title="Nuevo insumo de empaque">
        {dialogo?.tipo === "nuevo" && <InsumoForm onSuccess={cerrar} />}
      </EntityModal>
      <EntityModal open={dialogo?.tipo === "editar"} onClose={cerrar} title="Editar insumo">
        {dialogo?.tipo === "editar" && <InsumoForm insumo={dialogo.insumo} onSuccess={cerrar} />}
      </EntityModal>
      <EntityModal open={dialogo?.tipo === "compra"} onClose={cerrar} title="Registrar compra">
        {dialogo?.tipo === "compra" && <CompraInsumoForm insumo={dialogo.insumo} fechaHoy={fechaHoy} onSuccess={cerrar} />}
      </EntityModal>
      <EntityModal open={dialogo?.tipo === "ajuste"} onClose={cerrar} title="Ajustar stock">
        {dialogo?.tipo === "ajuste" && <AjusteInsumoForm insumo={dialogo.insumo} onSuccess={cerrar} />}
      </EntityModal>

      <DeleteConfirmationDialog
        open={dialogo?.tipo === "desactivar"}
        onOpenChange={(abierto) => !abierto && cerrar()}
        onConfirm={() => dialogo?.tipo === "desactivar" && void cambiarActivo(dialogo.insumo, false)}
        title="¿Desactivar insumo?"
        description={
          dialogo?.tipo === "desactivar"
            ? `«${dialogo.insumo.nombre}» dejará de admitir movimientos y se oculta de los formularios nuevos. Su historial y su stock se conservan, y puedes reactivarlo cuando quieras.`
            : undefined
        }
        confirmLabel="Desactivar"
      />

      <KardexInsumoDialog insumo={kardex} zonaHoraria={zonaHoraria} onClose={() => setKardex(null)} />
    </div>
  );
}
