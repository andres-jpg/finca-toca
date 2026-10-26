/**
 * Diccionario código → mensaje en español para mostrar al usuario (toasts de `sonner`).
 *
 * Los códigos son los que devuelve `callRpc()`: los cuatro que mapea el wrapper desde errores
 * de Postgres y los códigos de negocio que lanzan las funciones SQL con
 * `raise exception using errcode = 'P0001', message = '<codigo>'`. Cuando una función nueva
 * estrena un código, se añade aquí; si falta, `mensajeRpc()` cae en el `detail` que trajo la
 * función y, en último término, en un texto genérico.
 */
export const MENSAJES_RPC: Readonly<Record<string, string>> = {
  // Mapeados por el wrapper desde el código de Postgres
  no_autorizado: "No tienes permiso para realizar esta acción.",
  duplicado: "Ya existe un registro con esos datos.",
  referencia_invalida: "Alguno de los datos relacionados ya no existe o no es válido.",
  error_inesperado: "Ocurrió un error inesperado. Inténtalo de nuevo; si persiste, avísanos.",

  // De negocio (ejemplos del patrón; las funciones reales añaden los suyos)
  stock_insuficiente: "No hay existencias suficientes para completar la operación.",
  orden_proceso_invalido: "El orden del proceso no es válido para esta operación.",
  consecutivo_bloqueado: "El consecutivo está bloqueado por otra operación en curso. Inténtalo de nuevo.",
  tarifa_no_definida: "No hay una tarifa definida para esta operación.",
  serie_no_configurada: "La serie de numeración no está configurada.",
};

const MENSAJE_GENERICO = MENSAJES_RPC.error_inesperado;

/**
 * Mensaje para un código de `callRpc()`. `detalle` es el `detail` que puso la función SQL:
 * se usa cuando el código aún no está en el diccionario.
 */
export function mensajeRpc(codigo: string, detalle?: string | null): string {
  return MENSAJES_RPC[codigo] ?? (detalle ? detalle : MENSAJE_GENERICO);
}
