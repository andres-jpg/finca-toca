import Link from "next/link";
import { cn } from "@/lib/utils";
import { LineaBadge } from "../../components/linea-badge";
import type { LineaCopy } from "../../copy";

export type TipoIngreso = "marca_propia" | "servicio";

const OPCIONES: { linea: TipoIngreso & LineaCopy; query: string; descripcion: string }[] = [
  { linea: "marca_propia", query: "marca-propia", descripcion: "Compra de café para Cofradía · lote MP" },
  { linea: "servicio", query: "servicios", descripcion: "Trilla y/o maquila · lote MQ" },
];

/** Valor de `?tipo=` de la URL → tipo de ingreso; cualquier otro valor (o ninguno) es «sin elegir». */
export function tipoIngresoDesdeQuery(valor: string | string[] | undefined): TipoIngreso | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return OPCIONES.find((o) => o.query === v)?.linea ?? null;
}

/**
 * Primer campo de «Recibir café»: dos tarjetas grandes (≥ 44 px, sin hover). Son enlaces con `?tipo=`, así la
 * elección sobrevive a recargar y los formularios antiguos redirigen con el tipo ya puesto.
 */
export function TipoIngresoSelector({ valor }: { valor: TipoIngreso | null }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700">Tipo de ingreso</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPCIONES.map((o) => {
          const activa = valor === o.linea;
          return (
            <Link
              key={o.linea}
              href={`/dashboard/cafe/recibir?tipo=${o.query}`}
              replace
              aria-current={activa ? "true" : undefined}
              className={cn(
                "flex min-h-20 flex-col items-start justify-center gap-1.5 rounded-lg border-2 bg-white p-4 transition-colors",
                activa ? "border-amber-600 bg-amber-50" : "border-gray-200",
              )}
            >
              <LineaBadge linea={o.linea} />
              <span className="text-sm text-gray-600">{o.descripcion}</span>
            </Link>
          );
        })}
      </div>
    </fieldset>
  );
}
