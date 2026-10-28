import type { ReactNode } from "react";
import { requireSesion } from "@/modules/core/auth/guards";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { EstiloTermico } from "@/modules/core/print/components/estilo-termico";
import { PARAMETRO_IMPRESORA_ANCHO } from "@/modules/core/print/parametros";

/**
 * Páginas para la impresora térmica de tiquetes: sin barra lateral ni header del dashboard, fondo blanco y
 * tipografía monoespaciada a 9,5 pt. El ancho del rollo (58 u 80 mm) es el parámetro `core.impresora_ancho_mm`
 * del cliente. Una página puede forzar otro ancho para calibrar (`?ancho=58`) volviendo a montar `EstiloTermico`.
 *
 * El proxy solo protege `/dashboard`, así que la sesión se exige aquí: un tiquete lleva datos del cliente.
 */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  await requireSesion();
  const ancho = await getParametro(PARAMETRO_IMPRESORA_ANCHO);

  return (
    <>
      <EstiloTermico ancho={ancho} />
      <div className="hoja-termica" data-ancho-mm={ancho}>
        {children}
      </div>
    </>
  );
}
