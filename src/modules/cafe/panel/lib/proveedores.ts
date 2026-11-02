import { pctDeMerma } from "../../lotes/lib/formato";
import type { ProveedorMarcaPropia } from "../types";

// «Proveedores de marca propia» (A-19): precio/kg, humedad, merma de tostión y costo por kg tostado de cada proveedor, de los
// lotes de marca propia recibidos en el periodo (`cafe.proveedores_marca_propia`). El cálculo vive en la base; aquí solo se
// lee el json, sin fiarse, y se calcula la merma que se MUESTRA desde los kilos (igual que el resto del vertical).

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
