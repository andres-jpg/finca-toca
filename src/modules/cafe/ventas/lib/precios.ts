// Lista de precios de venta (FIN-112): son filas de `public.tarifas` con concepto `cafe.precio_<uuid del producto
// terminado sin guiones>`. El CHECK de `tarifas.concepto` solo admite UN punto, así que no puede ser
// `cafe.precio.<uuid>` como proponía la tarea. Pura: sin base ni React.

const PREFIJO = "cafe.precio_";

/** Concepto de tarifa del precio de venta de un producto terminado. Da lo mismo que `cafe.concepto_precio()` de SQL. */
export function conceptoPrecio(articuloId: string): string {
  return PREFIJO + articuloId.toLowerCase().replace(/-/g, "");
}

/** ¿Es un concepto de precio de venta? (cualquier producto). */
export function esConceptoPrecio(concepto: string): boolean {
  return /^cafe\.precio_[0-9a-f]{32}$/.test(concepto);
}

/**
 * Precio que rige ahora para cada producto, a partir de las tarifas vigentes (concepto → valor). Un producto sin
 * tarifa no aparece: la línea de venta pide el valor a mano.
 */
export function preciosPorArticulo(
  vigentes: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  articuloIds: readonly string[],
): Map<string, number> {
  const leer = (c: string) => (vigentes instanceof Map ? vigentes.get(c) : (vigentes as Record<string, number>)[c]);
  const precios = new Map<string, number>();
  for (const id of articuloIds) {
    const valor = leer(conceptoPrecio(id));
    if (valor !== undefined && Number.isFinite(valor)) precios.set(id, valor);
  }
  return precios;
}
