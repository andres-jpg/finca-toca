import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getParaDecidir } from "../queries/decidir.queries";
import type { LineaPanel } from "../types";
import { TarjetaKpi } from "./tarjeta-kpi";

interface Props {
  linea: LineaPanel | null;
  /** `YYYY-MM-DD` de hoy en la zona del cliente. */
  hoy: string;
}

const DEFINICION_DECIDIR =
  "Lo que pide una decisión hoy, con enlace a donde se resuelve: insumos bajo mínimo, presentaciones agotadas o bajas y lotes de terceros listos sin recoger (parámetro «días para avisar de un lote sin recoger»). Solo avisa; no bloquea nada.";

const TONO: Readonly<Record<string, string>> = {
  ambar: "border-amber-200 bg-amber-50 text-amber-900",
  rojo: "border-red-200 bg-red-50 text-red-900",
  gris: "border-stone-200 bg-stone-50 text-stone-800",
};

/**
 * «Para decidir hoy» del panel (A-19): lista accionable con enlaces. Foto de ahora: no depende del periodo, pero sí de la línea
 * elegida. Lee lo que ya calculan Planta e Inventario. No se maneja estado de pago ni cartera.
 */
export async function SeccionCartera({ linea, hoy }: Props) {
  const decidir = await getParaDecidir(linea, hoy);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] gap-3" data-testid="panel-cartera">
      <TarjetaKpi titulo="Para decidir hoy" definicion={DEFINICION_DECIDIR}>
        {decidir.length === 0 ? (
          <p className="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-gray-700">
            <CheckCircle2 className="h-4 w-4 text-teal-600" aria-hidden />
            Nada pendiente de decidir hoy.
          </p>
        ) : (
          <ul className="space-y-2">
            {decidir.map((i) => (
              <li key={i.id}>
                <Link href={i.href} className={cn("flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm hover:brightness-95", TONO[i.tono])}>
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{i.titulo}</span>
                    <span className="block truncate text-xs opacity-80">{i.detalle}</span>
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
