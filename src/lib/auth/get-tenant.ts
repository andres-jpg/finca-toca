/**
 * @deprecated El cliente de la sesión vive ahora en `@/modules/core/tenants/tenant.queries`
 * (`getTenantActual`, con vertical, marca y módulos activos) y los módulos en
 * `@/modules/core/tenants/tenant.guards` (`requireModulo`). Este fichero solo reexporta
 * `getTenantActual` y `Tenant` para no romper imports antiguos; se borra con la Fase 2.
 */
export { getTenantActual, type Tenant } from "@/modules/core/tenants/tenant.queries";
