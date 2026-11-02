import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ayudaEstadoMerma, ETIQUETA_ESTADO_MERMA } from "../procesos/lib/estado-texto";
import { estadoMerma, type EstadoMerma } from "../procesos/lib/merma";
import type { TipoProceso } from "../lotes/types";

// Gris neutro (no verde) en rango, rojo alta, ámbar baja: se distingue también por la palabra, no solo por el color.
const ESTILO: Record<EstadoMerma, string> = {
  en_rango: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  alta: "bg-red-100 text-red-800 hover:bg-red-100",
  baja: "bg-amber-100 text-amber-800 hover:bg-amber-100",
};

interface MermaBadgeProps {
  /** Merma % del bache, proceso o lote. */
  mermaPct: number;
  /** Referencia y tolerancia que rigieron (snapshot del proceso). Sin ellas no se pinta nada. */
  referenciaPct: number | null | undefined;
  toleranciaPts: number | null | undefined;
  /** Para elegir el texto auxiliar (en tostión habla de tueste). */
  tipo?: TipoProceso | null;
  /** Escribe la ayuda junto a la insignia (no depende del hover). Por defecto, sí. */
  conAyuda?: boolean;
  className?: string;
}

/**
 * Estado de una merma frente a su referencia ± tolerancia (A-03): «En rango» / «Revisar · alta» / «Verificar ·
 * baja». Único componente para bache, proceso, ficha y panel. Solo AVISA: nunca bloquea un guardado.
 */
export function MermaBadge({ mermaPct, referenciaPct, toleranciaPts, tipo, conAyuda = true, className }: MermaBadgeProps) {
  const estado = estadoMerma(mermaPct, referenciaPct, toleranciaPts);
  if (!estado) return null;
  const ayuda = ayudaEstadoMerma(estado, tipo);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-0.5", className)}>
      <Badge className={cn("gap-1", ESTILO[estado])} title={ayuda ?? undefined}>
        {estado !== "en_rango" && <AlertTriangle className="h-3 w-3" aria-hidden />}
        {ETIQUETA_ESTADO_MERMA[estado]}
      </Badge>
      {conAyuda && ayuda && <span className="text-xs text-gray-600">{ayuda}</span>}
    </span>
  );
}
