import { cache } from "react";
import { callRpc } from "@/modules/core/rpc/call-rpc";
import { GRAMOS_LIBRA, PRESENTACIONES_COSTO, leerCostoLibra, leerCostoLibraPanel, type CostoLibra, type CostoLibraLotePanel } from "../lib/costo-libra";

// Lectura del costo por libra (A-05 · HU-F1-17). Módulo plano (no "use server"). La frontera es la base: las funciones son
// `SECURITY INVOKER`, exigen miembro (y `cafe.dashboard` en la del panel) y leen tablas con RLS por cliente. Si la base
// falla se LANZA: un costo de cero falso es peor que el error. El cálculo no vive aquí: ver `cafe.costo_libra_lote`.

/** El costo de una libra del lote (`cafe.costo_libra_lote`); en lotes que no son de marca propia, `aplica` es false. */
export const getCostoLibraLote = cache(async (loteId: string, gramos: number = GRAMOS_LIBRA): Promise<CostoLibra> => {
  const r = await callRpc("cafe", "costo_libra_lote", { p_lote: loteId, p_gramos: gramos });
  if (!r.ok) throw new Error(`No se pudo calcular el costo por libra (${r.code})`);
  return leerCostoLibra(r.data);
});

/** Los lotes de marca propia empacados en el periodo con su costo (`cafe.costo_libra_panel`); agrupa por calidad en TS. */
export const getCostoLibraPanel = cache(async (desde: string, hasta: string, gramos: number = GRAMOS_LIBRA): Promise<CostoLibraLotePanel[]> => {
  const r = await callRpc("cafe", "costo_libra_panel", { p_desde: desde, p_hasta: hasta, p_gramos: gramos });
  if (!r.ok) throw new Error(`No se pudo cargar el costo por libra del panel (${r.code})`);
  return leerCostoLibraPanel(r.data);
});

/**
 * El costo por libra del lote en cada presentación pedida (B-13): una llamada por presentación. Si una falla se lanza: un costo
 * a medias o en cero engaña más que el error.
 */
export const getCostosLibraLote = cache(async (loteId: string, presentaciones: readonly number[] = PRESENTACIONES_COSTO): Promise<CostoLibra[]> => {
  return Promise.all(presentaciones.map((g) => getCostoLibraLote(loteId, g)));
});
