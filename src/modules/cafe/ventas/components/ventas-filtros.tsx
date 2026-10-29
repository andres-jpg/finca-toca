"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TerceroCombobox } from "@/modules/core/terceros/components/tercero-combobox";
import { Q_MAX_VENTA, type FiltrosVentas } from "../lib/filtros";

const CAMPO =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-9 md:text-sm";

/**
 * Filtros del listado de ventas: un formulario GET normal (los valores acaban en la URL, que se puede compartir)
 * que también filtra sin JavaScript. Cambiar un filtro vuelve a la primera página: `pagina` no viaja.
 */
export function VentasFiltros({ filtros, ruta }: { filtros: FiltrosVentas; ruta: string }) {
  const [tercero, setTercero] = useState<string | null>(filtros.tercero ?? null);

  return (
    <form method="get" action={ruta} className="rounded-lg border border-stone-200 bg-white p-3 sm:p-4">
      {tercero && <input type="hidden" name="tercero" value={tercero} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="space-y-1.5">
          <Label htmlFor="f-q">Número</Label>
          <Input id="f-q" name="q" defaultValue={filtros.q ?? ""} maxLength={Q_MAX_VENTA} placeholder="VT-2026-0001" className="h-11 sm:h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-tipo">Tipo</Label>
          <select id="f-tipo" name="tipo" defaultValue={filtros.tipo ?? ""} className={CAMPO}>
            <option value="">Ventas y cortesías</option>
            <option value="venta">Ventas</option>
            <option value="cortesia">Cortesías</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-estado">Estado</Label>
          <select id="f-estado" name="estado" defaultValue={filtros.estado ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            <option value="vigente">Vigentes</option>
            <option value="anulada">Anuladas</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-desde">Desde</Label>
          <Input id="f-desde" name="desde" type="date" defaultValue={filtros.desde ?? ""} className="h-11 sm:h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-hasta">Hasta</Label>
          <Input id="f-hasta" name="hasta" type="date" defaultValue={filtros.hasta ?? ""} className="h-11 sm:h-9" />
        </div>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <Label>Cliente</Label>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <TerceroCombobox value={tercero} onChange={(id) => setTercero(id)} rol="cliente" incluirConsumidorFinal placeholder="Todos" />
            </div>
            {tercero && (
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:h-9 sm:w-9" onClick={() => setTercero(null)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Quitar el filtro de cliente</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-gray-700 sm:min-h-0">
        <input type="checkbox" name="factura" value="pendiente" defaultChecked={filtros.facturaPendiente} className="h-5 w-5 accent-amber-600 sm:h-4 sm:w-4" />
        Solo con factura pendiente (requiere factura y aún no tiene número de Aliados)
      </label>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline" className="h-11 sm:h-9">
          <Link href={ruta}>Limpiar</Link>
        </Button>
        <Button type="submit" className="h-11 sm:h-9">
          Filtrar
        </Button>
      </div>
    </form>
  );
}
