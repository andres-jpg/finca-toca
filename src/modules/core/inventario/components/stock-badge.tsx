import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { estadoStock, formatearCantidad, type EstadoStock, type UnidadArticulo } from "../lib/inventario";

const ESTILO: Record<EstadoStock, { clase: string; aviso: string | null }> = {
  ok: { clase: "bg-green-100 text-green-800", aviso: null },
  bajo: { clase: "bg-amber-100 text-amber-800", aviso: "Bajo mínimo" },
  negativo: { clase: "bg-red-100 text-red-800", aviso: "Negativo" },
};

interface StockBadgeProps {
  stock: number;
  /** `null` = el artículo no tiene mínimo definido (nunca alerta por bajo). */
  stockMinimo: number | null;
  unidad?: UnidadArticulo;
  className?: string;
}

/**
 * Stock de un artículo con su estado: verde (ok), ámbar (bajo el mínimo) o rojo (negativo). El estado
 * también se escribe, no solo se colorea. Presentacional: sirve en componentes de servidor y de cliente.
 */
export function StockBadge({ stock, stockMinimo, unidad = "unidad", className }: StockBadgeProps) {
  const estado = estadoStock(stock, stockMinimo);
  const { clase, aviso } = ESTILO[estado];
  const cantidad = formatearCantidad(stock, unidad);

  return (
    <Badge
      variant="secondary"
      className={cn(clase, className)}
      title={aviso && stockMinimo !== null ? `${aviso} (${formatearCantidad(stockMinimo, unidad)})` : (aviso ?? undefined)}
    >
      {cantidad}
      {aviso && <span className="font-normal">· {aviso}</span>}
    </Badge>
  );
}
