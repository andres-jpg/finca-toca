// API pública del núcleo de plataforma. CO-08 … CO-18 irán exportando aquí.
export { callRpc, type Result } from "./rpc/call-rpc";
export { mensajeRpc } from "./rpc/mensajes";
export { getTenantActual, type Tenant, type Vertical, type TenantEstado } from "./tenants/tenant.queries";
export { getSesion, getSesionBase, type Sesion, type SesionBase, type Membresia, type RolTenant, type RolLegacy } from "./auth/sesion";
export { requireSesion, requireRolTenant, requirePlatformAdmin } from "./auth/guards";
export { requireModulo, requireModuloPagina, tenantTieneModulo } from "./tenants/tenant.guards";
export { MODULOS, tieneModulo, type ModuloId } from "./tenants/modulos";
export {
  crearArticulo,
  actualizarArticulo,
  desactivarArticulo,
  reactivarArticulo,
  registrarMovimientos,
} from "./inventario/actions/inventario.actions";
export { getStock, getKardex, type FiltrosStock, type RangoKardex } from "./inventario/queries/inventario.queries";
export {
  etiquetaArticulo,
  estadoStock,
  formatearCantidad,
  ETIQUETA_MOTIVO,
  ETIQUETA_TIPO,
  MOTIVOS,
  TIPOS_ARTICULO,
  UNIDADES,
  type MotivoMovimiento,
  type TipoArticulo,
  type UnidadArticulo,
} from "./inventario/lib/inventario";
export type { Articulo, StockArticulo, MovimientoKardex, RespuestaMovimientos } from "./inventario/types";
export { formatearConsecutivo } from "./consecutivos/formato";
export {
  crearTercero,
  actualizarTercero,
  desactivarTercero,
  reactivarTercero,
  buscarSimilares,
  listarOpcionesTerceros,
  asegurarConsumidorFinal,
} from "./terceros/actions/terceros.actions";
export { listarTerceros, type FiltrosTerceros } from "./terceros/queries/terceros.queries";
export { normalizarIdentificacion, normalizarNombre } from "./terceros/lib/normalizar";
export {
  ROLES_TERCERO,
  TIPOS_IDENTIFICACION,
  ETIQUETA_ROL_TERCERO,
  type RolTercero,
  type TipoIdentificacion,
} from "./terceros/lib/roles";
export { terceroSchema, type TerceroFormInput, type TerceroInput } from "./terceros/schemas/tercero.schema";
export type { Tercero, TerceroOpcion } from "./terceros/types";
export { construirNav, ocultoEnPWA, ORDEN_GRUPOS, type SesionNav } from "./registry/nav";
export { paginaInicial, PAGINA_INICIAL_POR_ROL, PAGINA_INICIAL_POR_VERTICAL } from "./registry/pagina-inicial";
export type { NavItemDef, ModuleManifest } from "./registry/types";
export { ICONOS_NAV, type IconoNav } from "./registry/iconos";
export { defineParametros, type ParametroDef, type ParametroTipo } from "./parametros/registry";
export { getParametro } from "./parametros/queries/parametros.queries";
export { defineConceptosTarifa, type ConceptoTarifaDef, type UnidadTarifa } from "./tarifas/registry";
export { getTarifaVigente, getTarifasVigentes, getHistorialTarifas } from "./tarifas/queries/tarifas.queries";
export { calcularValor } from "./tarifas/lib/calcular-valor";
export type { TarifaVigente, TarifaHistorial } from "./tarifas/types";
export {
  generarExcel,
  type Columna,
  type Hoja,
  type HojaExcel,
  type FormatoColumna,
  type OpcionesExcel,
} from "./export/generar-excel";
export { respuestaExcel } from "./export/respuesta";
export { nombreArchivoExport } from "./export/lib/nombre-archivo";
export { fetchAllPaginado, ExportError } from "./export/lib/paginar";
export {
  defineExportadores,
  parametro as parametroExport,
  type ExportadorDef,
  type ContextoExport,
  type ResultadoExport,
} from "./export/registry";
export { PARAMETRO_IMPRESORA_ANCHO } from "./print/parametros";
export { ANCHOS_IMPRESORA, type AnchoImpresora } from "./print/lib/ancho";
