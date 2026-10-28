// API pública del núcleo de plataforma. CO-08 … CO-18 irán exportando aquí.
export { callRpc, type Result } from "./rpc/call-rpc";
export { mensajeRpc } from "./rpc/mensajes";
export { getTenantActual, type Tenant, type Vertical, type TenantEstado } from "./tenants/tenant.queries";
export { requireModulo, tenantTieneModulo } from "./tenants/tenant.guards";
export { MODULOS, tieneModulo, type ModuloId } from "./tenants/modulos";
export { formatearConsecutivo } from "./consecutivos/formato";
