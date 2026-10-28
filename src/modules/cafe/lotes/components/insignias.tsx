import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { colorEstado, etiquetaEstado } from "../lib/estado";
import { colorTipoLote, etiquetaTipoLote, tipoVisibleLote } from "../lib/tipo-lote";
import type { LineaLote, TipoProceso } from "../types";

/** Insignia del tipo del lote: Marca propia / Trilla / Maquila / Trilla + maquila. */
export function TipoLoteBadge({ linea, servicios, className }: { linea: LineaLote; servicios: readonly TipoProceso[]; className?: string }) {
  const tipo = tipoVisibleLote(linea, servicios);
  return <Badge className={cn("whitespace-nowrap", colorTipoLote(tipo), className)}>{etiquetaTipoLote(tipo)}</Badge>;
}

/** Insignia del estado derivado del lote. */
export function EstadoLoteBadge({ estado, className }: { estado: string | null | undefined; className?: string }) {
  return <Badge className={cn("whitespace-nowrap", colorEstado(estado), className)}>{etiquetaEstado(estado)}</Badge>;
}
