import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { getTarifasVigentes } from "@/modules/core/tarifas/queries/tarifas.queries";
import { PARAMETROS_CAFE } from "../../parametros";
import { obtenerPerfilTuesteVigente } from "../../perfiles/queries/perfiles.queries";
import type { RangoCalidad } from "../lib/calidad";
import type { MermasReferencia } from "../lib/estimar-servicios";
import type { NivelTueste } from "../../lotes/types";
import type { ServicioTarifado } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS de `parametros`
// y `tarifas` (lectura para cualquier miembro del cliente).

/** Lo que el formulario de recepción necesita saber de la configuración del cliente. */
export interface ConfigRecepcion {
  /** `null` = sin configurar: no se avisa. */
  rangoHumedad: RangoCalidad | null;
  rangoDensidad: RangoCalidad | null;
  mermasRef: Required<MermasReferencia>;
  /** Tarifa vigente ahora por servicio; `null` = sin tarifa. */
  tarifas: Record<ServicioTarifado, number | null>;
  /** Perfil predeterminado de maquila vigente hoy (B-18): precarga el panel «Perfil de tueste»; `null` = sin configurar. */
  perfilMaquila: { nivel: NivelTueste; tempC: number; tiempoMin: number } | null;
}

export async function getConfigRecepcion(fechaHoy: string): Promise<ConfigRecepcion> {
  const [rangoHumedad, rangoDensidad, mermaTrilla, tostionBajo, tostionMedio, tostionAlto, vigentes, perfil] = await Promise.all([
    getParametro(PARAMETROS_CAFE.humedadRangoPct),
    getParametro(PARAMETROS_CAFE.densidadRango),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTrillaPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionBajoPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionMedioPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionAltoPct),
    getTarifasVigentes(),
    obtenerPerfilTuesteVigente(null, fechaHoy),
  ]);

  const tarifa = (concepto: string) => vigentes.find((t) => t.concepto === concepto)?.valor ?? null;

  return {
    rangoHumedad,
    rangoDensidad,
    mermasRef: { trilla: mermaTrilla, tostion: { bajo: tostionBajo, medio: tostionMedio, alto: tostionAlto } },
    tarifas: {
      trilla: tarifa("cafe.trilla"),
      tostion: tarifa("cafe.tostion"),
      molienda: tarifa("cafe.molienda"),
    },
    perfilMaquila: perfil ? { nivel: perfil.nivel, tempC: perfil.tempC, tiempoMin: perfil.tiempoMin } : null,
  };
}
