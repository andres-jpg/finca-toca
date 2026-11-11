import { pctDeMerma } from "../../lotes/lib/formato";
import { estadoMerma, type EstadoMerma } from "../../procesos/lib/merma";
import type { Rango } from "../../parametros";
import type { ProveedorMarcaPropia } from "../types";

// «Proveedores de marca propia»: precio/kg, humedad, merma de tostión y costo por kg tostado de cada proveedor, de los lotes de
// marca propia recibidos en el periodo (`cafe.proveedores_marca_propia`). El cálculo vive en la base; aquí solo se lee el json,
// sin fiarse, se calcula la merma que se MUESTRA desde los kilos (igual que el resto del vertical) y se decide el semáforo.

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

export function leerProveedores(json: unknown): ProveedorMarcaPropia[] {
  if (!esObjeto(json)) throw new Error("Respuesta inesperada de los proveedores");
  const lista = Array.isArray(json.proveedores) ? json.proveedores.filter(esObjeto) : [];
  return lista.map((p) => {
    const kgEntrada = num(p.kg_tostion_entrada);
    const kgSalida = num(p.kg_tostion_salida);
    return {
      terceroId: typeof p.tercero_id === "string" ? p.tercero_id : null,
      nombre: typeof p.nombre === "string" && p.nombre ? p.nombre : "Sin nombre",
      lotes: num(p.lotes),
      kg: num(p.kg),
      valorCompra: num(p.valor_compra),
      precioKg: numONull(p.precio_kg),
      humedadPct: numONull(p.humedad_pct),
      kgTostionEntrada: kgEntrada,
      kgTostionSalida: kgSalida,
      // Desde los kilos (2 decimales, medios hacia arriba), como la merma de las demás pantallas.
      mermaTostionPct: kgEntrada > 0 ? pctDeMerma(kgEntrada - kgSalida, kgEntrada) : null,
      costoKgTostado: numONull(p.costo_kg_tostado),
    };
  });
}

/** Rango de humedad del café en el que se da el semáforo cuando el cliente no ha configurado el suyo (10–12 %). */
export const HUMEDAD_PANEL_DEFECTO: Rango = { min: 10, max: 12 };

export type SemaforoProveedor = "en_rango" | "fuera" | null;

export interface EstadoProveedor {
  /** `null` = sin dato (no hay humedad medida / no hay tostión / no hay referencia): no se pinta nada. */
  humedad: SemaforoProveedor;
  merma: SemaforoProveedor;
  /** Cuál de los dos se aparta, en palabras para «Para decidir hoy». */
  motivos: string[];
  /** Alguno de los dos está fuera de rango (ámbar). */
  fuera: boolean;
  /** Sentido de la merma fuera de banda, para el texto («alta»). */
  sentidoMerma: EstadoMerma | null;
}

/**
 * Semáforo de un proveedor: gris en rango, ámbar fuera. Humedad contra el rango (límites incluidos) y merma de tostión contra
 * la referencia ± tolerancia (A-03, límites incluidos). Sin dato o sin referencia no hay semáforo, no un «en rango» inventado.
 */
export function estadoProveedor(
  p: Pick<ProveedorMarcaPropia, "humedadPct" | "mermaTostionPct">,
  humedad: Rango,
  referenciaMermaPct: number | null,
  toleranciaPts: number,
): EstadoProveedor {
  const h: SemaforoProveedor = p.humedadPct === null ? null : p.humedadPct >= humedad.min && p.humedadPct <= humedad.max ? "en_rango" : "fuera";
  const sentidoMerma = p.mermaTostionPct === null ? null : estadoMerma(p.mermaTostionPct, referenciaMermaPct, toleranciaPts);
  const m: SemaforoProveedor = sentidoMerma === null ? null : sentidoMerma === "en_rango" ? "en_rango" : "fuera";
  const motivos: string[] = [];
  if (h === "fuera") motivos.push("humedad");
  if (m === "fuera") motivos.push("merma de tostión");
  return { humedad: h, merma: m, motivos, fuera: motivos.length > 0, sentidoMerma };
}
