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

/**
 * Glosario de tueste (B-20 · FIN-146). Tostión = el proceso. Tipo de café = Excelso o Consumo (solo marca propia).
 * Nivel de tueste = Alto, Medio o Bajo. Perfil de tueste = nivel + temperatura + tiempo. Perfil 1, Perfil 2 = cada
 * perfil con sus kilos en un lote de maquila con varios. La palabra «receta» no se usa en ninguna pantalla ni
 * documento impreso (lo vigila `copy.test.ts`).
 */
export const COPY_TUESTE = {
  tostion: "Tostión",
  tipoDeCafe: "Tipo de café",
  nivelDeTueste: "Nivel de tueste",
  perfilDeTueste: "Perfil de tueste",
  /** Configuración: los perfiles de tueste se definen por tipo de café. */
  perfilesPorTipoDeCafe: "Perfiles de tueste por tipo de café",
  /** Columna de la tabla de baches cuando el lote trae varios perfiles. */
  columnaPerfil: "Perfil",
  /** «Perfil 1», «Perfil 2»…: `n` es la posición 1-based. */
  perfilN: (n: number) => `Perfil ${n}`,
} as const;
