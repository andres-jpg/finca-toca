import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatearPesos } from "@/modules/core/tarifas/lib/formato";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import type { TipoProceso } from "../../lotes/types";
import { formatearCompacto, formatearPeso, formatearPorcentaje } from "../lib/numero";
import { textoDesvio, type MermaEnVivo, type ValorServicio } from "../lib/resumen";

interface ResumenMermaProps {
  tipo: TipoProceso;
  /** `null` mientras falte la entrada o la salida. */
  merma: MermaEnVivo | null;
  /** `null` = no se cobra aquí (marca propia o empaque). */
  valor: ValorServicio | null;
  /** Empaque de maquila: va incluido sin coste. */
  empaqueIncluido: boolean;
  /** Fecha del proceso distinta de hoy: la tarifa que cuenta es la vigente ese día. */
  fechaDistintaDeHoy: boolean;
  puedeConfigurarTarifas: boolean;
}

/**
 * Merma en vivo y valor del servicio. El desvío AVISA en ámbar pero no bloquea (HU-04 c4): el proceso se guarda
 * igual y queda marcado. El valor es de solo lectura: lo calcula la base con la tarifa vigente en la fecha del
 * proceso (HU-09 c2); aquí es una vista previa con la tarifa de hoy.
 */
export function ResumenMerma({ tipo, merma, valor, empaqueIncluido, fechaDistintaDeHoy, puedeConfigurarTarifas }: ResumenMermaProps) {
  const aviso = merma ? textoDesvio(merma) : null;

  return (
    <section aria-label="Merma" className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-gray-800">Merma de {etiquetaServicio(tipo).toLowerCase()}</h2>

      {merma ? (
        <div role="status" aria-live="polite" className="space-y-2">
          <p className="flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums text-gray-900">{formatearPorcentaje(merma.mermaPct)} %</span>
            <span className="text-base tabular-nums text-gray-600">{formatearPeso(merma.mermaKg)} kg</span>
          </p>
          {merma.referenciaPct !== null ? (
            <p className="text-sm text-gray-500">
              Referencia {formatearCompacto(merma.referenciaPct)} % ± {formatearCompacto(merma.toleranciaPts)} puntos
            </p>
          ) : (
            <p className="text-sm text-gray-500">Sin merma de referencia en este paso: no se marca desvío.</p>
          )}
          {aviso && (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {aviso}.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Indica el peso de entrada y el de salida para ver la merma.</p>
      )}

      {valor && (
        <div className="space-y-1 border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-500">Valor del servicio</p>
          {valor.tarifaKg === null ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No hay tarifa definida para este servicio: no se podrá registrar.{" "}
              {puedeConfigurarTarifas ? (
                <Link href="/dashboard/tarifas" className="font-medium underline underline-offset-2">
                  Configúrala en Tarifas y parámetros
                </Link>
              ) : (
                "Pide a un administrador que la configure."
              )}
            </p>
          ) : (
            <>
              <p className="text-base text-gray-800">
                Tarifa vigente <span className="font-semibold tabular-nums">{formatearPesos(valor.tarifaKg)}/kg</span>
                {valor.valor !== null && (
                  <>
                    {" · Valor "}
                    <span className="text-lg font-bold tabular-nums">{formatearPesos(valor.valor)}</span>
                  </>
                )}
              </p>
              {fechaDistintaDeHoy && (
                <p className="text-xs text-gray-500">La tarifa final es la vigente en la fecha del proceso.</p>
              )}
            </>
          )}
        </div>
      )}

      {empaqueIncluido && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-500">Valor del servicio</p>
          <p className="text-base text-gray-800">Incluido sin coste — la bolsa la trae el cliente.</p>
        </div>
      )}
    </section>
  );
}
