import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { etiquetaArticulo } from "../lib/inventario";
import type { StockArticulo } from "../types";
import { StockBadge } from "./stock-badge";

interface AlertaStockBajoProps {
  /** Lo que devuelve `getStock({ soloBajoMinimo: true })`. */
  articulos: StockArticulo[];
  /** Cuántos se listan antes de resumir el resto en "y N más". */
  maximo?: number;
  className?: string;
}

/** Tarjeta de dashboard con los artículos que están por debajo de su stock mínimo. Presentacional. */
export function AlertaStockBajo({ articulos, maximo = 5, className }: AlertaStockBajoProps) {
  const visibles = articulos.slice(0, maximo);
  const restantes = articulos.length - visibles.length;

  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className={cn("h-4 w-4", articulos.length > 0 ? "text-amber-600" : "text-green-600")} aria-hidden />
          Stock bajo
          {articulos.length > 0 && (
            <span className="ml-auto text-sm font-normal text-muted-foreground">{articulos.length}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {articulos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todos los artículos están por encima de su mínimo.</p>
        ) : (
          <ul className="space-y-2">
            {visibles.map((a) => {
              const detalle = etiquetaArticulo(a.atributos);
              return (
                <li key={a.articulo_id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.nombre}</span>
                    {detalle && <span className="block truncate text-xs text-muted-foreground">{detalle}</span>}
                  </span>
                  <StockBadge stock={a.stock} stockMinimo={a.stock_minimo} unidad={a.unidad} />
                </li>
              );
            })}
            {restantes > 0 && <li className="text-xs text-muted-foreground">y {restantes} más</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
