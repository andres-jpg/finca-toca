import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { COPY_LINEA, type LineaCopy } from "../copy";

// Colores con los tokens que el vertical ya usa en sus insignias (verde = teal/emerald, caramelo = amber).
const ESTILO: Record<LineaCopy, string> = {
  marca_propia: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  servicio: "bg-amber-100 text-amber-800 hover:bg-amber-100",
};

/**
 * Etiqueta de la línea de negocio: «Marca propia» (verde: se compra, se procesa y se vende) o «Servicios a terceros»
 * (caramelo: trilla y maquila, se remisiona). Se distingue por la palabra, no solo por el color.
 */
export function LineaBadge({ linea, className }: { linea: LineaCopy; className?: string }) {
  return <Badge className={cn(ESTILO[linea], className)}>{COPY_LINEA[linea]}</Badge>;
}
