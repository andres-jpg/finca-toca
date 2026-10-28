import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { getTarifasVigentes } from "@/modules/core/tarifas/queries/tarifas.queries";
import { PARAMETROS_CAFE } from "../../parametros";
import type { RangoCalidad } from "../lib/calidad";
import type { MermasReferencia } from "../lib/estimar-servicios";
import type { ServicioTarifado } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS de `parametros`
// y `tarifas` (lectura para cualquier miembro del cliente).

/** Lo que el formulario de recepción necesita saber de la configuración del cliente. */
export interface ConfigRecepcion {
  /** `null` = sin configurar: no se avisa. */
  rangoHumedad: RangoCalidad | null;
  rangoDensidad: RangoCalidad | null;
  /** Kilos por bulto, para sugerir el peso total al contar bultos. */
  pesoBultoKg: number;
  mermasRef: Required<MermasReferencia>;
  /** Tarifa vigente ahora por servicio; `null` = sin tarifa. */
  tarifas: Record<ServicioTarifado, number | null>;
}

export async function getConfigRecepcion(): Promise<ConfigRecepcion> {
  const [rangoHumedad, rangoDensidad, pesoBultoKg, mermaTrilla, mermaTostion, vigentes] = await Promise.all([
    getParametro(PARAMETROS_CAFE.humedadRangoPct),
    getParametro(PARAMETROS_CAFE.densidadRango),
    getParametro(PARAMETROS_CAFE.pesoBultoKg),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTrillaPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionPct),
    getTarifasVigentes(),
  ]);

  const tarifa = (concepto: string) => vigentes.find((t) => t.concepto === concepto)?.valor ?? null;

  return {
    rangoHumedad,
    rangoDensidad,
    pesoBultoKg,
    mermasRef: { trilla: mermaTrilla, tostion: mermaTostion },
    tarifas: {
      trilla: tarifa("cafe.trilla"),
      tostion: tarifa("cafe.tostion"),
      molienda: tarifa("cafe.molienda"),
    },
  };
}
