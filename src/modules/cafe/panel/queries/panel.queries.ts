import { cache } from "react";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { callRpc } from "@/modules/core/rpc/call-rpc";
import { PARAMETROS_CAFE, type Rango } from "../../parametros";
import { promedioPonderadoPorCalidad } from "../../costo/lib/costo-libra";
import { getCostoLibraPanel } from "../../costo/queries/costo.queries";
import { claveCosto, leerProduccion, leerProduccionPanel, leerVentasDiarias, leerVentasPresentacion, type CostosLibra } from "../lib/kpis";
import { desdeHistorico } from "../lib/periodo";
import { HUMEDAD_PANEL_DEFECTO, leerProveedores } from "../lib/proveedores";
import type { FilaProduccion, FilaProduccionPanel, ProveedorMarcaPropia, VentaDiaria, VentaPresentacion } from "../types";

// Lectura del panel de gerencia («Cómo va el negocio», B-14). Módulo plano (no "use server"): solo lo llaman las secciones del
// servidor de `/dashboard/cafe`. La frontera real es la base: las funciones son `SECURITY INVOKER`, exigen membresía y el
// módulo `cafe.dashboard` (42501 si no) y leen tablas con RLS por cliente. Se envuelven en `React.cache()` para que las
// secciones de la página (cada una en su `Suspense`) compartan una sola llamada por request en vez de repetirla. Si la base
// falla se LANZA: un panel con ceros falsos es peor que el error boundary.

function fallo(nombre: string, code: string): never {
  throw new Error(`No se pudo cargar el panel (${nombre}: ${code})`);
}

/** Una fila por día, línea y tipo de proceso (`cafe.produccion_diaria`): el valor de los servicios por día. */
export const getProduccionDiaria = cache(async (desde: string, hasta: string): Promise<FilaProduccion[]> => {
  const r = await callRpc("cafe", "produccion_diaria", { p_desde: desde, p_hasta: hasta });
  if (!r.ok) return fallo("producción", r.code);
  return leerProduccion(r.data ?? []);
});

/** Ventas de marca propia por día (`cafe.ventas_diarias`). */
export const getVentasDiarias = cache(async (desde: string, hasta: string): Promise<VentaDiaria[]> => {
  const r = await callRpc("cafe", "ventas_diarias", { p_desde: desde, p_hasta: hasta });
  if (!r.ok) return fallo("ventas", r.code);
  return leerVentasDiarias(r.data ?? []);
});

/** Los kg que entran a trilla, tostión y molienda por línea (`cafe.produccion_panel`). */
export const getProduccionPanel = cache(async (desde: string, hasta: string): Promise<FilaProduccionPanel[]> => {
  const r = await callRpc("cafe", "produccion_panel", { p_desde: desde, p_hasta: hasta });
  if (!r.ok) return fallo("producción del periodo", r.code);
  return leerProduccionPanel(r.data ?? []);
});

/** Lo vendido (sin cortesías ni anuladas) por producto terminado (`cafe.ventas_por_presentacion`). */
export const getVentasPresentacion = cache(async (desde: string, hasta: string): Promise<VentaPresentacion[]> => {
  const r = await callRpc("cafe", "ventas_por_presentacion", { p_desde: desde, p_hasta: hasta });
  if (!r.ok) return fallo("ventas por presentación", r.code);
  return leerVentasPresentacion(r.data ?? []);
});

/**
 * Referencia y tolerancia de la merma de tostión (A-03). Solo es una cifra si los tres niveles de tueste coinciden; si
 * difieren, un agregado mezclaría referencias distintas y no se marca (`null`).
 */
export const getReferenciasPanel = cache(async (): Promise<{ tostion: number | null; toleranciaPts: number }> => {
  const [bajo, medio, alto, toleranciaPts] = await Promise.all([
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionBajoPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionMedioPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionAltoPct),
    getParametro(PARAMETROS_CAFE.mermaToleranciaPts),
  ]);
  return { tostion: bajo === medio && medio === alto ? medio : null, toleranciaPts };
});

/** El promedio mensual de libras vendidas (parámetro del cliente; no es una meta). */
export const getPromedioVentasLbMes = cache(async (): Promise<number> => getParametro(PARAMETROS_CAFE.promedioVentasLbMes));

/** El rango de humedad del cliente, o el del panel (10–12 %) si aún no lo ha configurado. */
export const getRangoHumedad = cache(async (): Promise<Rango> => (await getParametro(PARAMETROS_CAFE.humedadRangoPct)) ?? HUMEDAD_PANEL_DEFECTO);

/** Proveedores de marca propia con precio/kg, humedad, merma de tostión y costo por kg tostado (`cafe.proveedores_marca_propia`). */
export const getProveedoresMarcaPropia = cache(async (desde: string, hasta: string): Promise<ProveedorMarcaPropia[]> => {
  const r = await callRpc("cafe", "proveedores_marca_propia", { p_desde: desde, p_hasta: hasta });
  if (!r.ok) return fallo("proveedores", r.code);
  return leerProveedores(r.data);
});

/**
 * El costo por libra de cada calidad × presentación (B-13): el promedio ponderado por kg empacado de los lotes de marca propia
 * con costo, de todo el histórico (`cafe.costo_libra_panel`). Es el costo de lo VENDIDO, que puede venir de lotes de otros
 * meses. `gramosCsv` = presentaciones separadas por coma (un `string` para que `cache` reconozca la misma llamada).
 */
export const getCostosLibra = cache(async (hoy: string, gramosCsv: string): Promise<CostosLibra> => {
  const costos = new Map<string, number | null>();
  for (const g of gramosCsv.split(",").map(Number).filter((x) => x > 0)) {
    for (const c of promedioPonderadoPorCalidad(await getCostoLibraPanel(desdeHistorico(hoy), hoy, g))) costos.set(claveCosto(c.tipoCafeId, g), c.costoLibra);
  }
  return costos;
});
