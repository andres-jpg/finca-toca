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
  movimientos_invalidos: "Los movimientos no son válidos. Revisa los datos e inténtalo de nuevo.",
  movimiento_invalido: "Alguno de los movimientos no es válido. Revisa los datos e inténtalo de nuevo.",
  articulo_no_encontrado: "El artículo no existe o no pertenece a tu cliente.",
  articulo_inactivo: "El artículo está desactivado. Actívalo para registrar movimientos.",
  datos_invalidos: "Revisa los datos del formulario.",
  orden_proceso_invalido: "El orden del proceso no es válido para esta operación.",
  consecutivo_bloqueado: "El consecutivo está bloqueado por otra operación en curso. Inténtalo de nuevo.",
  tarifa_no_definida: "No hay una tarifa definida para esta operación.",
  tarifa_no_eliminable: "Solo se pueden eliminar tarifas programadas (aún no vigentes). Para corregir una vigente, crea una nueva.",
  serie_no_configurada: "La serie de numeración no está configurada.",
  tenant_no_permitido: "No tienes acceso a ese cliente.",
  tenant_no_encontrado: "El cliente indicado no existe.",
  no_autenticado: "Debes iniciar sesión para continuar.",
  tercero_no_encontrado: "El tercero no existe o no pertenece a tu cliente.",
  consumidor_final_protegido: "El tercero «Consumidor final» es un registro del sistema: no se edita ni se desactiva.",
  consumidor_final_no_disponible: "No se puede crear el «Consumidor final»: su identificación (222222222222) ya la usa otro tercero.",
  tipo_cafe_no_encontrado: "El tipo de café no existe o no pertenece a tu cliente.",
  // Lotes y bultos (café)
  bultos_no_cuadran: "Los bultos no cuadran con el lote: revisa su número y que sus pesos sumen el peso total.",
  lote_bloqueado: "El lote ya tiene procesos: no se pueden cambiar el peso, los bultos, el tercero ni los servicios anteriores.",
  lote_anulado: "El lote está anulado: ya no se puede modificar.",
  lote_con_procesos: "El lote ya tiene procesos registrados: no se puede anular.",
  servicios_invalidos: "Los servicios del lote no son válidos (la molienda requiere tostión).",
  // Compra de café para marca propia
  tipo_cafe_invalido: "El tipo de café no existe o está inactivo: elige uno de la lista.",
  tercero_no_es_proveedor: "El tercero elegido no está registrado como proveedor de café. Un administrador debe añadirle ese rol.",
  // Recepción de clientes (café)
  sin_servicios: "Elige al menos un servicio para la recepción.",
  falta_nivel_tueste: "Indica el nivel de tueste (bajo, medio o alto): la planta lo necesita para la tostión.",
  tercero_inactivo: "El tercero está desactivado: actívalo para registrar recepciones.",
  tercero_no_es_cliente_servicio: "El tercero no está registrado como cliente de servicios. Un administrador debe añadirle ese rol.",
  // Alta de clientes (plataforma)
  slug_duplicado: "Ya existe un cliente con ese identificador.",
  slug_invalido: "El identificador debe tener de 3 a 40 caracteres: minúsculas, números y guiones.",
  nombre_invalido: "El nombre del cliente es obligatorio.",
  vertical_invalido: "Indica el vertical del cliente.",
  modulo_no_valido: "El módulo no existe o no corresponde al vertical del cliente.",
  cambios_invalidos: "Alguno de los cambios no es válido.",
  plan_invalido: "El plan es obligatorio.",
  color_invalido: "El color debe ser hexadecimal, p. ej. #1A7F5A.",
  estado_invalido: "El estado no es válido.",
  rol_invalido: "Indica el rol del miembro.",
  usuario_no_encontrado: "No hay ningún usuario con ese email. Debe tener cuenta antes de añadirlo.",
  usuario_con_rol_en_otro_cliente: "Ese usuario ya tiene un rol en otro cliente de ganadería.",
  miembro_no_encontrado: "Ese usuario no es miembro activo del cliente.",
  // Equipo del cliente
  ya_es_miembro: "Ese usuario ya es miembro del equipo.",
  email_invalido: "El correo electrónico no es válido.",
  no_puede_modificarse_a_si_mismo: "No puedes cambiar tu propio rol ni tu estado.",
  solo_owner_gestiona_owner: "Solo un propietario puede crear o modificar propietarios.",
  ultimo_owner: "Debe quedar al menos un propietario activo.",
  invitacion_no_enviada: "No se pudo enviar la invitación. Inténtalo de nuevo; si persiste, avísanos.",
};

const MENSAJE_GENERICO = MENSAJES_RPC.error_inesperado;

/**
 * Mensaje para un código de `callRpc()`. `detalle` es el `detail` que puso la función SQL:
 * se usa cuando el código aún no está en el diccionario.
 */
export function mensajeRpc(codigo: string, detalle?: string | null): string {
  return MENSAJES_RPC[codigo] ?? (detalle ? detalle : MENSAJE_GENERICO);
}
