import { cache } from "react";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { callRpc } from "@/modules/core/rpc/call-rpc";
import { PARAMETROS_CAFE } from "../../parametros";
import { leerKpis, leerProduccion, leerVentasDiarias } from "../lib/kpis";
import type { FilaProduccion, KpisPanel, LineaPanel, VentaDiaria } from "../types";

// Lectura del panel de gerencia (FIN-115 · CO-34). Módulo plano (no "use server"): solo lo llaman las secciones del
// servidor de `/dashboard/cafe`. La frontera real es la base: las tres funciones son `SECURITY INVOKER`, exigen
// membresía y el módulo `cafe.dashboard` (42501 si no) y leen tablas con RLS por cliente. Se envuelven en
// `React.cache()` para que las secciones de la página (cada una en su `Suspense`) compartan una sola llamada por
// request en vez de repetirla. Si la base falla se LANZA: un panel con ceros falsos es peor que el error boundary.

function argumentos(desde: string, hasta: string, linea: LineaPanel | null) {
  return { p_desde: desde, p_hasta: hasta, ...(linea ? { p_linea: linea } : {}) };
}

function fallo(nombre: string, code: string): never {
  throw new Error(`No se pudo cargar el panel (${nombre}: ${code})`);
}

/** Todas las tarjetas del panel en un solo round-trip (`cafe.kpis_periodo`). */
export const getKpisPanel = cache(async (desde: string, hasta: string, linea: LineaPanel | null): Promise<KpisPanel> => {
  const r = await callRpc("cafe", "kpis_periodo", argumentos(desde, hasta, linea));
  if (!r.ok) return fallo("kpis", r.code);
  return leerKpis(r.data);
});

/** Una fila por día, línea y tipo de proceso (`cafe.produccion_diaria`): los gráficos y el resumen por rango. */
export const getProduccionDiaria = cache(async (desde: string, hasta: string, linea: LineaPanel | null): Promise<FilaProduccion[]> => {
  const r = await callRpc("cafe", "produccion_diaria", argumentos(desde, hasta, linea));
  if (!r.ok) return fallo("producción", r.code);
  return leerProduccion(r.data ?? []);
});

/** Ventas de marca propia por día (`cafe.ventas_diarias`): la serie «marca propia» del gráfico de ingreso. */
export const getVentasDiarias = cache(async (desde: string, hasta: string, linea: LineaPanel | null): Promise<VentaDiaria[]> => {
  const r = await callRpc("cafe", "ventas_diarias", argumentos(desde, hasta, linea));
  if (!r.ok) return fallo("ventas", r.code);
  return leerVentasDiarias(r.data ?? []);
});

/** Las mermas de referencia vigentes (trilla y tostión): son las líneas discontinuas del gráfico de merma. */
export const getReferenciasMerma = cache(async (): Promise<{ trilla: number; tostion: number }> => {
  const [trilla, tostion] = await Promise.all([
    getParametro(PARAMETROS_CAFE.mermaReferenciaTrillaPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionPct),
  ]);
  return { trilla, tostion };
});
