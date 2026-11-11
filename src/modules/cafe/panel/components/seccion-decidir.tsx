import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFINICIONES } from "../lib/kpis";
import { getParaDecidir } from "../queries/decidir.queries";
import { TarjetaKpi } from "./tarjeta-kpi";

const TONO: Readonly<Record<string, string>> = {
  ambar: "border-amber-200 bg-amber-50 text-amber-900",
  rojo: "border-red-200 bg-red-50 text-red-900",
  gris: "border-stone-200 bg-stone-50 text-stone-800",
};

/**
 * «Para decidir hoy»: lista accionable con enlaces (presentaciones agotadas con su ritmo de venta, insumos bajo mínimo, lotes
 * listos sin recoger y proveedores fuera de rango). Foto de ahora: no depende del periodo. Sin cartera: no hay estado de pago.
 */
export async function SeccionDecidir({ hoy }: { hoy: string }) {
  const decidir = await getParaDecidir(hoy);

  return (
    <div data-testid="panel-decidir">
      <TarjetaKpi titulo={DEFINICIONES.decidir.titulo} definicion={DEFINICIONES.decidir.texto}>
        {decidir.length === 0 ? (
          <p className="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-gray-700">
            <CheckCircle2 className="h-4 w-4 text-teal-600" aria-hidden />
            Nada pendiente de decidir hoy.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {decidir.map((i) => (
              <li key={i.id}>
                <Link href={i.href} className={cn("flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm hover:brightness-95", TONO[i.tono])}>
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{i.titulo}</span>
                    <span className="block text-xs opacity-80">{i.detalle}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </TarjetaKpi>
    </div>
  );
}
