"use client";

import Link from "next/link";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TerceroCombobox } from "@/modules/core/terceros/components/tercero-combobox";
import { ESTADOS_LOTE, etiquetaEstado } from "../lib/estado";
import { Q_MAX, serializarFiltros, type FiltrosLotes } from "../lib/filtros";

const CAMPO =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-9 md:text-sm";

/**
 * Filtros del listado. Es un formulario GET normal (los valores acaban en la URL, que se puede compartir y es la
 * que recibe la exportación a Excel): sin JavaScript también filtra. Los lotes de «Marca propia» no tienen
 * subtipo; en «Servicios» se ofrece Trilla / Maquila. `tipo` lo fija la pestaña activa y viaja como campo oculto.
 */
export function LotesFiltros({ filtros, ruta }: { filtros: FiltrosLotes; ruta: string }) {
  const [tercero, setTercero] = useState<string | null>(filtros.tercero ?? null);
  const esServicios = filtros.tipo === "servicios" || filtros.tipo === "trilla" || filtros.tipo === "maquila";
  // «Limpiar» quita todo menos la pestaña.
  const limpiar = serializarFiltros({ tipo: filtros.tipo });

  return (
    <form method="get" action={ruta} className="rounded-lg border border-stone-200 bg-white p-3 sm:p-4">
      {/* Cambiar un filtro vuelve a la primera página: `pagina` no viaja. */}
      {filtros.tipo && !esServicios && <input type="hidden" name="tipo" value={filtros.tipo} />}
      {tercero && <input type="hidden" name="tercero" value={tercero} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="space-y-1.5">
          <Label htmlFor="f-q">Código</Label>
          <Input id="f-q" name="q" defaultValue={filtros.q ?? ""} maxLength={Q_MAX} placeholder="MQ-2026-0007" className="h-11 sm:h-9" />
        </div>

        {esServicios && (
          <div className="space-y-1.5">
            <Label htmlFor="f-tipo">Servicio</Label>
            <select id="f-tipo" name="tipo" defaultValue={filtros.tipo} className={CAMPO}>
              <option value="servicios">Todos los servicios</option>
              <option value="trilla">Trilla</option>
              <option value="maquila">Maquila</option>
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="f-estado">Estado</Label>
          <select id="f-estado" name="estado" defaultValue={filtros.estado ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            {ESTADOS_LOTE.map((e) => (
              <option key={e} value={e}>
                {etiquetaEstado(e)}
              </option>
            ))}
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
          <Label>Proveedor / cliente</Label>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <TerceroCombobox value={tercero} onChange={(id) => setTercero(id)} placeholder="Todos" />
            </div>
            {tercero && (
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:h-9 sm:w-9" onClick={() => setTercero(null)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Quitar el filtro de proveedor / cliente</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline" className="h-11 sm:h-9">
          <Link href={limpiar ? `${ruta}?${limpiar}` : ruta}>Limpiar</Link>
        </Button>
        <Button type="submit" className="h-11 sm:h-9">
          Filtrar
        </Button>
      </div>
    </form>
  );
}
