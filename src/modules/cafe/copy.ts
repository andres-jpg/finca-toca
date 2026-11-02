// Vocabulario del vertical de café (FIN-139 · T-00). Un solo sitio para los nombres de las dos líneas de negocio, de
// modo que la pantalla no mezcle «cliente», «servicios (clientes)» o «producto terminado» con «Marca propia» y
// «Servicios a terceros». Los identificadores internos (`marca_propia`, `servicio`, `vigente`) no cambian: solo el
// texto visible.

export const COPY_LINEA = {
  /** Se compra, se procesa y se VENDE. */
  marca_propia: "Marca propia",
  /** Trilla y maquila; se REMISIONA. */
  servicio: "Servicios a terceros",
} as const;

export type LineaCopy = keyof typeof COPY_LINEA;

export const COPY = {
  marcaPropia: COPY_LINEA.marca_propia,
  serviciosATerceros: COPY_LINEA.servicio,
  /** Encabezado de grupo en listados, con aclaración del origen del café. */
  marcaPropiaCafeComprado: "Marca propia (café comprado)",
  serviciosCafeTerceros: "Servicios a terceros (café de terceros)",
  /** Lo que se vende de marca propia ya empacado (antes «Producto terminado»). */
  inventarioMarcaPropia: "Inventario de marca propia",
  existenciaMarcaPropia: "Marca propia en existencia",
  /** Vacío de la cola de planta de servicios. */
  colaServiciosVacia: "No hay café de terceros pendiente de proceso.",
  /** Estados de remisión: no existe «Vigente»; una remisión no anulada está entregada. */
  remisionEntregada: "Entregada",
  remisionEntregadas: "Entregadas",
  anulada: "Anulada",
  /** Nombre de respaldo cuando un producto de una venta ya no tiene nombre. */
  productoRespaldo: "Producto",
} as const;
