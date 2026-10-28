// Matriz del producto terminado: tipo de café × presentación (HU-F1-06 c2). El inventario se consulta SIEMPRE
// desglosado: esta matriz no calcula ningún total mezclado (ni por fila ni por columna), porque sumar «unidades»
// de 500 g con las de 2.500 g, o Excelso con Consumo, no significa nada. Pura: sin base ni React.
import { kgPorUnidades } from "./empaque";

/** Un producto terminado: una fila de `v_stock` con su tipo de café y presentación ya leídos. */
export interface ProductoTerminado {
  articuloId: string;
  nombre: string;
  /** Unidades disponibles (puede ser negativo: se muestra en rojo, es información, no un error). */
  stock: number;
  tipoCafeId: string;
  presentacionG: number;
  activo: boolean;
}

export interface TipoCafeMatriz {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
}

export interface CeldaMatriz {
  producto: ProductoTerminado;
  /** Kilos que equivalen a esas unidades (informativo). */
  kg: number;
}

export interface FilaMatriz {
  tipoCafeId: string;
  tipoCafe: string;
  /** Por presentación en gramos; ausente si ese tipo no tiene ese producto. */
  celdas: Partial<Record<number, CeldaMatriz>>;
}

export interface MatrizProductoTerminado {
  /** Presentaciones en gramos, de menor a mayor: son las columnas. */
  presentaciones: number[];
  filas: FilaMatriz[];
}

/** `tipo_cafe_id` y `presentacion_g` de los `atributos` de un producto terminado, o `null` si no son válidos. */
export function leerAtributosProducto(atributos: unknown): { tipoCafeId: string; presentacionG: number } | null {
  if (atributos === null || typeof atributos !== "object" || Array.isArray(atributos)) return null;
  const { tipo_cafe_id: tipo, presentacion_g: g } = atributos as Record<string, unknown>;
  if (typeof tipo !== "string" || tipo === "") return null;
  if (typeof g !== "number" || !Number.isFinite(g) || g <= 0) return null;
  return { tipoCafeId: tipo, presentacionG: g };
}

/**
 * Arma la matriz. Filas: los tipos de café activos, más los inactivos que aún tengan stock (un tipo desactivado
 * conserva sus productos y su existencia, y no debe desaparecer mientras queden unidades). Columnas: las
 * presentaciones de los productos que se muestran (activos o con stock). Un producto inactivo sin existencias no aparece.
 */
export function construirMatriz(productos: readonly ProductoTerminado[], tipos: readonly TipoCafeMatriz[]): MatrizProductoTerminado {
  const visibles = productos.filter((p) => p.activo || p.stock !== 0);

  const filas = [...tipos]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))
    .flatMap((t): FilaMatriz[] => {
      const suyos = visibles.filter((p) => p.tipoCafeId === t.id);
      // Un tipo desactivado solo se queda mientras le quede algo en existencia.
      if (!t.activo && !suyos.some((p) => p.stock !== 0)) return [];
      const celdas: FilaMatriz["celdas"] = {};
      for (const p of suyos) celdas[p.presentacionG] = { producto: p, kg: kgPorUnidades(p.presentacionG, p.stock) };
      return [{ tipoCafeId: t.id, tipoCafe: t.nombre, celdas }];
    });

  const presentaciones = [...new Set(filas.flatMap((f) => Object.values(f.celdas).flatMap((c) => (c ? [c.producto.presentacionG] : []))))].sort(
    (a, b) => a - b,
  );
  return { presentaciones, filas };
}
