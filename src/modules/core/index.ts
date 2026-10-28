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
export { construirNav, ocultoEnPWA, ORDEN_GRUPOS, type SesionNav } from "./registry/nav";
export { paginaInicial, PAGINA_INICIAL_POR_ROL, PAGINA_INICIAL_POR_VERTICAL } from "./registry/pagina-inicial";
export type { NavItemDef, ModuleManifest } from "./registry/types";
export { ICONOS_NAV, type IconoNav } from "./registry/iconos";
