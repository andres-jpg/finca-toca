import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { enteroConMiles } from "@/modules/cafe/empaque/lib/empaque";

/**
 * Único resto del resumen (A-16: las tarjetas pasaron al panel): el aviso «N ventas requieren número de Aliados»,
 * con enlace al listado filtrado por factura pendiente. No se pinta si no hay ninguna.
 */
export function AvisoFacturasPendientes({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <Link
      href="/dashboard/cafe/ventas?factura=pendiente"
      className="flex min-h-11 items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {n === 1 ? "1 venta requiere número de Aliados" : `${enteroConMiles(n)} ventas requieren número de Aliados`}
    </Link>
  );
}
