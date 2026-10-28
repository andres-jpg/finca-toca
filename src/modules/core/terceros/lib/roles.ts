/** Roles que puede tener un tercero (se combinan). Coinciden con el CHECK de `terceros.roles`. */
export const ROLES_TERCERO = ["proveedor", "cliente", "cliente_servicio"] as const;
export type RolTercero = (typeof ROLES_TERCERO)[number];

export const ETIQUETA_ROL_TERCERO: Record<RolTercero, string> = {
  proveedor: "Proveedor de materia prima",
  cliente: "Cliente de marca propia",
  cliente_servicio: "Cliente de maquila / servicio",
};

/** Etiqueta corta para tablas y chips. */
export const ETIQUETA_ROL_TERCERO_CORTA: Record<RolTercero, string> = {
  proveedor: "Proveedor",
  cliente: "Cliente",
  cliente_servicio: "Maquila",
};

/** Coinciden con el enum `tipo_identificacion`. */
export const TIPOS_IDENTIFICACION = ["NIT", "CC", "CE", "PAS", "OTRO"] as const;
export type TipoIdentificacion = (typeof TIPOS_IDENTIFICACION)[number];

export const ETIQUETA_TIPO_IDENTIFICACION: Record<TipoIdentificacion, string> = {
  NIT: "NIT",
  CC: "Cédula de ciudadanía",
  CE: "Cédula de extranjería",
  PAS: "Pasaporte",
  OTRO: "Otro",
};
