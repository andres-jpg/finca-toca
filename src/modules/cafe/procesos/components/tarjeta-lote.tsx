import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fechaCorta, formatearPeso } from "../lib/numero";
import { NOTA_EMPAQUE_MARCA_PROPIA, textoSiguientePaso } from "../lib/pasos";
import { ETIQUETA_ALERTA_CALIDAD } from "../../recepciones/lib/calidad";
import type { TarjetaLotePlanta } from "../types-planta";
import { NivelTuesteChip } from "./nivel-tueste-chip";

const ETIQUETA_ESTADO: Record<TarjetaLotePlanta["estado"], string> = {
  recibido: "Recibido",
  en_proceso: "En proceso",
  parcial: "Parcial",
  listo: "Listo",
  anulado: "Anulado",
};

/**
 * Tarjeta de la cola de trabajo de la planta: todo es un solo objetivo táctil (el enlace a la pantalla del
 * lote). Código grande, quién lo trajo, el SIGUIENTE paso con los bultos pendientes, el nivel de tueste de
 * maquila bien visible, los kg que hay en planta y las alertas (que avisan, no bloquean). Nada depende del hover.
 */
export function TarjetaLote({ lote }: { lote: TarjetaLotePlanta }) {
  const { siguiente } = lote;
  const empaqueMarcaPropia = lote.linea === "marca_propia" && siguiente?.tipo === "empaque";
  const alertas = [
    ...lote.alertasCalidad.map((a) => ETIQUETA_ALERTA_CALIDAD[a] ?? a),
    ...(lote.tieneDesvio ? ["Merma desviada"] : []),
  ];

  return (
    <Link
      href={`/dashboard/cafe/planta/${lote.id}`}
      className="group flex min-h-32 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm outline-none transition-colors hover:border-gray-400 focus-visible:ring-2 focus-visible:ring-gray-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight text-gray-900 tabular-nums">{lote.codigo}</p>
          <p className="truncate text-base text-gray-700">
            {lote.tercero}
            {lote.tipoCafe && <span className="text-gray-500"> · {lote.tipoCafe}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
            {ETIQUETA_ESTADO[lote.estado]} · {lote.avanceTexto}
          </span>
          <ChevronRight className="h-5 w-5 text-gray-400" aria-hidden />
        </div>
      </div>

      {siguiente ? (
        <div>
          <p className="text-lg font-semibold text-gray-900">Siguiente: {textoSiguientePaso(siguiente)}</p>
          {empaqueMarcaPropia && <p className="text-sm text-gray-500">{NOTA_EMPAQUE_MARCA_PROPIA}</p>}
        </div>
      ) : (
        <p className="text-lg font-semibold text-gray-500">Sin pasos pendientes</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
        {lote.nivelTueste && <NivelTuesteChip nivel={lote.nivelTueste} />}
        <span>
          <span className="font-semibold tabular-nums text-gray-900">{formatearPeso(lote.pesoActualKg)} kg</span> disponibles
        </span>
        <span className="text-gray-500">
          Recibido {fechaCorta(lote.fechaRecepcion)} · {lote.numBultos} {lote.numBultos === 1 ? "bulto" : "bultos"}
        </span>
      </div>

      {alertas.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Alertas">
          {alertas.map((a) => (
            <li
              key={a}
              className={cn("inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800")}
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
