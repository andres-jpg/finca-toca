/**
 * Nombres de los productos terminados del café. Función pura (sin base ni React): la misma salida que
 * `cafe.etiqueta_presentacion()` en SQL, y los dos tests comparten casos. El producto terminado se lleva
 * por tipo de café × presentación; la presentación la define el peso nominal de la bolsa en gramos.
 */

/** 500 → «500 g», 2500 → «2.500 g» (separador de miles con punto, como se lee en Colombia). */
export function etiquetaPresentacion(gramos: number): string {
  const entero = String(Math.round(gramos)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${entero} g`;
}

/** «Excelso» + 500 → «Excelso 500 g». Es el nombre del artículo que crea `asegurar_productos_terminados()`. */
export function nombreProductoTerminado(tipo: string, presentacionG: number): string {
  return `${tipo.trim().replace(/\s+/g, " ")} ${etiquetaPresentacion(presentacionG)}`;
}

/**
 * Nombre para mostrar de un producto terminado: el de la base lleva «molido» solo en el molido («Excelso 500 g molido»);
 * el de grano se rotula «Excelso 500 g grano» para que la forma sea siempre explícita. Si ya trae la forma no la repite.
 * Solo es presentación: el nombre guardado en `articulos` no cambia.
 */
export function nombreProductoVisible(nombre: string): string {
  return /\s(molido|grano)$/i.test(nombre.trim()) ? nombre.trim() : `${nombre.trim()} grano`;
}
