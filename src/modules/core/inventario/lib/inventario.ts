/**
 * Piezas puras (sin servidor ni React) del inventario tipo kardex. Las comparten los schemas, las
 * acciones y los componentes, y se pueden importar desde el navegador. Las listas replican los enums
 * de Postgres (`tipo_articulo`, `motivo_movimiento`) y el CHECK `movimiento_signo_valido()`.
 */

export const TIPOS_ARTICULO = ["insumo", "producto_terminado", "materia_prima", "otro"] as const;
export type TipoArticulo = (typeof TIPOS_ARTICULO)[number];

export const UNIDADES = ["unidad", "kg", "g", "litro"] as const;
export type UnidadArticulo = (typeof UNIDADES)[number];

export const MOTIVOS_ENTRADA = ["saldo_inicial", "compra", "produccion", "devolucion"] as const;
export const MOTIVOS_SALIDA = ["consumo", "venta", "cortesia", "muestra", "perdida", "reapertura"] as const;
/** `ajuste` es el único motivo que admite cualquier signo. */
export const MOTIVOS = [...MOTIVOS_ENTRADA, ...MOTIVOS_SALIDA, "ajuste"] as const;
export type MotivoMovimiento = (typeof MOTIVOS)[number];

export const ETIQUETA_TIPO: Record<TipoArticulo, string> = {
  insumo: "Insumo",
  producto_terminado: "Producto terminado",
  materia_prima: "Materia prima",
  otro: "Otro",
};

export const ETIQUETA_MOTIVO: Record<MotivoMovimiento, string> = {
  saldo_inicial: "Saldo inicial",
  compra: "Compra",
  produccion: "Producción",
  devolucion: "Devolución",
  consumo: "Consumo",
  venta: "Venta",
  cortesia: "Cortesía",
  muestra: "Muestra",
  perdida: "Pérdida",
  reapertura: "Reapertura",
  ajuste: "Ajuste",
};

/** Abreviatura con la que se muestra la cantidad de un artículo. */
const ABREVIATURA_UNIDAD: Record<UnidadArticulo, string> = { unidad: "u", kg: "kg", g: "g", litro: "L" };

/** +1 entrada, −1 salida, 0 = cualquiera (`ajuste`). Mismo criterio que `movimiento_signo_valido()` en SQL. */
export function signoMotivo(motivo: MotivoMovimiento): 1 | -1 | 0 {
  if ((MOTIVOS_ENTRADA as readonly string[]).includes(motivo)) return 1;
  if ((MOTIVOS_SALIDA as readonly string[]).includes(motivo)) return -1;
  return 0;
}

/** ¿La cantidad con signo es coherente con el motivo? (espejo del CHECK de la base). */
export function signoValido(motivo: MotivoMovimiento, cantidad: number): boolean {
  if (cantidad === 0) return false;
  const signo = signoMotivo(motivo);
  return signo === 0 || Math.sign(cantidad) === signo;
}

/**
 * Cantidad con el signo que exige el motivo, a partir de la magnitud que escribe el usuario.
 * En un `ajuste` el signo lo decide `direccion` (aumenta/disminuye).
 */
export function cantidadConSigno(
  motivo: MotivoMovimiento,
  magnitud: number,
  direccion?: "entrada" | "salida",
): number {
  const abs = Math.abs(magnitud);
  const signo = signoMotivo(motivo);
  if (signo !== 0) return signo * abs;
  return direccion === "salida" ? -abs : abs;
}

export type EstadoStock = "ok" | "bajo" | "negativo";

/** Negativo manda sobre bajo mínimo; sin mínimo (`null`) nunca está "bajo". Estricto: stock = mínimo es "ok". */
export function estadoStock(stock: number, stockMinimo: number | null): EstadoStock {
  if (stock < 0) return "negativo";
  if (stockMinimo !== null && stock < stockMinimo) return "bajo";
  return "ok";
}

/** `1234.5` → "1.234,5 kg". Hasta 3 decimales, como la columna `numeric(14,3)`. */
export function formatearCantidad(cantidad: number, unidad: UnidadArticulo = "unidad"): string {
  const numero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(cantidad);
  return `${numero} ${ABREVIATURA_UNIDAD[unidad]}`;
}

// Sufijos de clave que indican una medida: `presentacion_g` → "500 g".
const SUFIJO_MEDIDA: Record<string, string> = { g: "g", kg: "kg", ml: "ml", l: "L", cm: "cm", mm: "mm", lb: "lb", oz: "oz" };

function capitalizar(texto: string): string {
  const limpio = texto.replace(/_/g, " ").trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * Texto legible de los `atributos` de un artículo: primero los valores de texto, después las
 * medidas, separados por " · ". `{"tipo_cafe":"excelso","presentacion_g":500}` → "Excelso · 500 g".
 * Núcleo genérico: no conoce ningún atributo en particular, solo el sufijo de unidad de las claves.
 * Devuelve "" si no hay nada que mostrar (la interfaz cae entonces en el nombre del artículo).
 */
export function etiquetaArticulo(atributos: unknown): string {
  if (atributos === null || typeof atributos !== "object" || Array.isArray(atributos)) return "";

  const textos: string[] = [];
  const medidas: string[] = [];
  for (const [clave, valor] of Object.entries(atributos)) {
    if (typeof valor === "string") {
      if (valor.trim() !== "") textos.push(capitalizar(valor));
    } else if (typeof valor === "number" && Number.isFinite(valor)) {
      const sufijo = SUFIJO_MEDIDA[clave.slice(clave.lastIndexOf("_") + 1)];
      medidas.push(clave.includes("_") && sufijo ? `${valor} ${sufijo}` : String(valor));
    }
    // booleanos, null, objetos y listas no tienen una forma obvia de mostrarse: se omiten
  }
  return [...textos, ...medidas].join(" · ");
}
