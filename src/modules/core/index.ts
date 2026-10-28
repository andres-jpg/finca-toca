// API pública del núcleo de plataforma. CO-08 … CO-18 irán exportando aquí.
export { callRpc, type Result } from "./rpc/call-rpc";
export { mensajeRpc } from "./rpc/mensajes";
export { getTenantActual, type Tenant, type Vertical, type TenantEstado } from "./tenants/tenant.queries";
export { requireModulo, tenantTieneModulo } from "./tenants/tenant.guards";
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
