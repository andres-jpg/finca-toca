import Link from "next/link";
import { ChevronRight, PackageOpen } from "lucide-react";
import { fechaCorta, formatearPeso } from "../../procesos/lib/numero";
import { ETIQUETA_ESTADO_REAPERTURA, textoPasosReapertura, tituloTarjetaReapertura } from "../lib/reapertura";
import type { ReaperturaVista } from "../types";

/**
 * Tarjeta de la cola de planta para una reapertura (HU-F1-16): «Reapertura de MP-2026-0003 · 20 kg · Excelso» con sus
 * pasos (molienda y/o empaque). Como las de los lotes, todo es un solo objetivo táctil y nada depende del hover.
 */
export function TarjetaReapertura({ reapertura: r }: { reapertura: ReaperturaVista }) {
  return (
    <Link
      href={`/dashboard/cafe/planta/reapertura/${r.id}`}
      className="group flex min-h-32 flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50/50 p-4 shadow-sm outline-none transition-colors hover:border-amber-500 focus-visible:ring-2 focus-visible:ring-gray-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xl font-bold tracking-tight text-gray-900">
            <PackageOpen className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <span className="tabular-nums">{tituloTarjetaReapertura(r.loteCodigo, r.pesoKg, r.tipoCafe)}</span>
          </p>
          <p className="truncate text-base text-gray-700">
            {r.unidades} × {r.producto}
            {r.motivo && <span className="text-gray-500"> · {r.motivo}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">{ETIQUETA_ESTADO_REAPERTURA[r.estado]}</span>
          <ChevronRight className="h-5 w-5 text-gray-400" aria-hidden />
        </div>
      </div>

      <p className="text-lg font-semibold text-gray-900">Siguiente: {textoPasosReapertura(r.estado)}</p>

      <p className="text-sm text-gray-600">
        <span className="font-semibold tabular-nums text-gray-900">{formatearPeso(r.pesoDisponibleKg)} kg</span> disponibles
        <span className="text-gray-500"> · Reabierto el {fechaCorta(r.fecha)}</span>
      </p>
    </Link>
  );
}
