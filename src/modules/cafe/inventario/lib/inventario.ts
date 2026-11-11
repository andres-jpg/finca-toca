// Inventario del café en tres pestañas (A-15 · FIN-133). Puro: sin base ni React. Las tres pestañas NUNCA se suman
// entre sí (marca propia es de Cofradía; el café de terceros es de sus clientes), así que nada aquí devuelve un
// total que mezcle listas de pestañas distintas.
import { diasEntre } from "../../procesos/lib/cola";
import type { MatrizProductoTerminado } from "../../empaque/lib/matriz";

export const PESTANAS_INVENTARIO = ["marca-propia", "servicios", "insumos"] as const;
export type PestanaInventario = (typeof PESTANAS_INVENTARIO)[number];

export const ETIQUETA_PESTANA: Readonly<Record<PestanaInventario, string>> = {
  "marca-propia": "Marca propia",
  servicios: "Servicios a terceros",
  insumos: "Insumos",
};

/** Etiqueta visible de la pestaña con su contador: «Servicios a terceros · 6 en planta», «Insumos · 2 bajos». */
export function etiquetaPestana(p: PestanaInventario, conteos: { enPlanta?: number; bajos?: number } = {}): string {
  if (p === "servicios" && conteos.enPlanta) return `${ETIQUETA_PESTANA[p]} · ${conteos.enPlanta} en planta`;
  if (p === "insumos" && conteos.bajos) return `${ETIQUETA_PESTANA[p]} · ${conteos.bajos} ${conteos.bajos === 1 ? "bajo" : "bajos"}`;
  return ETIQUETA_PESTANA[p];
}

/** Mensaje fijo de la pestaña de terceros. */
export const MENSAJE_TERCEROS = "Café de clientes · no es inventario de Cofradía";

/** La pestaña de `?tab=`; cualquier otro valor cae en marca propia. */
export function parsearPestana(valor: string | string[] | undefined): PestanaInventario {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return (PESTANAS_INVENTARIO as readonly string[]).includes(v ?? "") ? (v as PestanaInventario) : "marca-propia";
}

export const hrefPestana = (p: PestanaInventario): string => (p === "marca-propia" ? "/dashboard/cafe/inventario" : `/dashboard/cafe/inventario?tab=${p}`);

/** Días naturales que lleva un lote en planta (desde la recepción, ambos `YYYY-MM-DD`); nunca negativo. */
export function diasEnPlanta(fechaRecepcion: string, hoy: string): number {
  return Math.max(0, diasEntre(fechaRecepcion, hoy));
}

/** Un lote de servicio listo que lleva más de N días en planta se resalta (parámetro compartido con el tablero, A-13). */
export function resaltarSinRecoger(estado: string, dias: number, umbral: number): boolean {
  return estado === "listo" && dias > umbral;
}

export type EstadoPresentacion = "agotado" | "bajo" | "ok";

/** Stock de un producto terminado: agotado (≤ 0), bajo (≤ mínimo, si lo tiene) u ok. */
export function estadoPresentacion(stock: number, stockMinimo: number | null): EstadoPresentacion {
  if (stock <= 0) return "agotado";
  if (stockMinimo !== null && stock < stockMinimo) return "bajo";
  return "ok";
}

export interface EmpaqueSaldo {
  loteId: string;
  articuloId: string;
  unidades: number;
}
export interface ConversionSaldo {
  loteId: string;
  origenId: string;
  destinoId: string;
  unidadesOrigen: number;
  unidadesDestino: number;
}

/**
 * Unidades convertibles de cada (lote, producto): lo empacado de ese lote, menos lo reabierto y lo convertido
 * hacia otra presentación, más lo convertido hacia él. Igual que `cafe.convertir_presentacion`.
 * Solo devuelve saldos > 0.
 */
export function saldosPorLote(
  empaques: readonly EmpaqueSaldo[],
  reaperturas: readonly EmpaqueSaldo[],
  conversiones: readonly ConversionSaldo[],
): EmpaqueSaldo[] {
  const mapa = new Map<string, EmpaqueSaldo>();
  const sumar = (loteId: string, articuloId: string, n: number) => {
    const k = `${loteId}:${articuloId}`;
    const f = mapa.get(k) ?? { loteId, articuloId, unidades: 0 };
    f.unidades += n;
    mapa.set(k, f);
  };
  for (const e of empaques) sumar(e.loteId, e.articuloId, e.unidades);
  for (const r of reaperturas) sumar(r.loteId, r.articuloId, -r.unidades);
  for (const c of conversiones) {
    sumar(c.loteId, c.origenId, -c.unidadesOrigen);
    sumar(c.loteId, c.destinoId, c.unidadesDestino);
  }
  return [...mapa.values()].filter((s) => s.unidades > 0);
}

// --- Libras y cobertura (B-10 · FIN-156) -------------------------------------------------------------------------------

/** Una libra = 500 g. */
export const GRAMOS_POR_LIBRA = 500;
/** Ventana del promedio de ventas para la cobertura. */
export const DIAS_VENTANA_COBERTURA = 30;

/** Libras disponibles = Σ (unidades × gramos) / 500. Una bolsa de 2.500 g son 5 lb. Unidades negativas no suman. */
export function librasDisponibles(items: readonly { unidades: number; gramos: number }[]): number {
  return items.reduce((a, i) => a + Math.max(0, i.unidades) * (i.gramos / GRAMOS_POR_LIBRA), 0);
}

/** Promedio diario de libras vendidas en la ventana. */
export function promedioDiarioLibras(libras: number, dias: number = DIAS_VENTANA_COBERTURA): number {
  return dias > 0 ? libras / dias : 0;
}

/** Cobertura en días = libras disponibles / promedio diario de libras vendidas en 30 días. Sin ventas → `null` («—»). */
export function coberturaDias(libras: number, ventasLb30d: number, dias: number = DIAS_VENTANA_COBERTURA): number | null {
  const diario = promedioDiarioLibras(ventasLb30d, dias);
  return diario > 0 ? libras / diario : null;
}

/** Café verde «alcanza para» (días) = kg verde × (1 − merma de referencia) × 2 / promedio diario de libras de ese tipo. */
export function alcanceVerde(kgVerde: number, mermaReferenciaPct: number, ventasLb30d: number, dias: number = DIAS_VENTANA_COBERTURA): number | null {
  const diario = promedioDiarioLibras(ventasLb30d, dias);
  return diario > 0 ? (kgVerde * (1 - mermaReferenciaPct / 100) * 2) / diario : null;
}

/** Cobertura bajo el umbral (por defecto 10 días): se marca en rojo. `null` (sin ventas) no es alerta. */
export const coberturaBaja = (dias: number | null, umbral: number): boolean => dias !== null && dias < umbral;

/** Cobertura en días enteros para mostrar («12 días», «1 día»); redondea hacia abajo (no promete más de lo que hay). */
export function textoDias(dias: number | null): string {
  if (dias === null) return "—";
  const n = Math.floor(dias + 1e-9);
  return `${n} ${n === 1 ? "día" : "días"}`;
}

export interface LibrasVendidas {
  articuloId: string;
  tipoCafeId: string;
  presentacionG: number;
  libras: number;
}

/** Lee el jsonb de `cafe.libras_vendidas`. */
export function leerLibrasVendidas(raw: unknown): LibrasVendidas[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f): LibrasVendidas[] => {
    if (f === null || typeof f !== "object") return [];
    const r = f as Record<string, unknown>;
    const libras = Number(r.libras);
    const g = Number(r.presentacion_g);
    if (typeof r.tipo_cafe_id !== "string" || !Number.isFinite(libras) || !Number.isFinite(g)) return [];
    return [{ articuloId: String(r.articulo_pt_id ?? ""), tipoCafeId: r.tipo_cafe_id, presentacionG: g, libras }];
  });
}

/** Libras vendidas por tipo de café (todas las presentaciones y formas). */
export function librasPorTipo(v: readonly LibrasVendidas[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of v) m.set(x.tipoCafeId, (m.get(x.tipoCafeId) ?? 0) + x.libras);
  return m;
}

/** Libras vendidas por tipo de café × presentación (clave `tipo:gramos`, grano y molido juntos). */
export function librasPorTipoPresentacion(v: readonly LibrasVendidas[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of v) m.set(`${x.tipoCafeId}:${x.presentacionG}`, (m.get(`${x.tipoCafeId}:${x.presentacionG}`) ?? 0) + x.libras);
  return m;
}

/** Una fila de la tabla «Producto terminado · listo para vender»: tipo de café + presentación con grano y molido. */
export interface FilaProductoTerminado {
  clave: string;
  tipoCafeId: string;
  tipoCafe: string;
  presentacionG: number;
  grano: { articuloId: string; nombre: string; unidades: number; activo: boolean } | null;
  molido: { articuloId: string; nombre: string; unidades: number; activo: boolean } | null;
  libras: number;
  /** Días que alcanza al ritmo de los últimos 30 días; `null` sin ventas. */
  cobertura: number | null;
}

/**
 * Una fila por tipo de café × presentación (grano y molido juntos), con libras y cobertura. Cada presentación se calcula con
 * sus propias ventas (grano + molido). Nunca hay un total que mezcle filas.
 */
export function filasProductoTerminado(matriz: MatrizProductoTerminado, ventasLbPorTipoPresentacion: ReadonlyMap<string, number>): FilaProductoTerminado[] {
  const filas: FilaProductoTerminado[] = [];
  for (const f of matriz.filas) {
    const gramos = [...new Set([...Object.keys(f.celdas), ...Object.keys(f.celdasMolido)].map(Number))].sort((a, b) => a - b);
    for (const g of gramos) {
      const cg = f.celdas[g]?.producto;
      const cm = f.celdasMolido[g]?.producto;
      const libras = librasDisponibles([
        { unidades: cg?.stock ?? 0, gramos: g },
        { unidades: cm?.stock ?? 0, gramos: g },
      ]);
      filas.push({
        clave: `${f.tipoCafeId}:${g}`,
        tipoCafeId: f.tipoCafeId,
        tipoCafe: f.tipoCafe,
        presentacionG: g,
        grano: cg ? { articuloId: cg.articuloId, nombre: cg.nombre, unidades: cg.stock, activo: cg.activo } : null,
        molido: cm ? { articuloId: cm.articuloId, nombre: cm.nombre, unidades: cm.stock, activo: cm.activo } : null,
        libras,
        cobertura: coberturaDias(libras, ventasLbPorTipoPresentacion.get(`${f.tipoCafeId}:${g}`) ?? 0),
      });
    }
  }
  return filas;
}

/** Cobertura global del producto terminado: libras totales / promedio diario de libras vendidas (todos los tipos). */
export function coberturaGlobal(filas: readonly FilaProductoTerminado[], ventasLbTotal30d: number): { libras: number; cobertura: number | null } {
  const libras = filas.reduce((a, f) => a + f.libras, 0);
  return { libras, cobertura: coberturaDias(libras, ventasLbTotal30d) };
}
