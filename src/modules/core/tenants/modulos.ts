/**
 * Catálogo de módulos de la plataforma, en el código.
 *
 * Es un fichero **puro a propósito** (sin `next/headers` ni Supabase) para que lo importe tanto la
 * barra lateral —componente de cliente, que recibe la lista de módulos por props— como las páginas
 * y los Server Actions. Importa de aquí directamente, no del barril `@/modules/core`, que arrastra
 * código de servidor.
 *
 * `MODULOS` debe coincidir con el seed de `public.modulos` (migración `tenants_modulos`): un test
 * de Vitest lo compara contra la base local. Para añadir un módulo: migración con su fila en
 * `modulos` y su id aquí. Para ACTIVARLO a un cliente no hace falta tocar nada de esto: es una fila
 * en `tenant_modulos` (ver CLAUDE.md → Módulos por cliente).
 */
export const MODULOS = [
  // Ganadería
  "ganaderia.animales",
  "ganaderia.extracciones",
  "ganaderia.finanzas",
  "ganaderia.inventario",
  "ganaderia.arriendos",
  "ganaderia.control_lechero",
  // Cooperativa
  "cooperativa.rutas",
  "cooperativa.recolecciones",
  "cooperativa.pagos",
  "cooperativa.informes",
  // Café
  "cafe.recepcion",
  "cafe.procesos",
  "cafe.inventario",
  "cafe.remisiones",
  "cafe.ventas",
  "cafe.dashboard",
  "cafe.exportacion",
  // Núcleo
  "core.terceros",
  "core.auditoria",
  "core.equipo",
] as const;

export type ModuloId = (typeof MODULOS)[number];

/**
 * ¿Está `id` entre los módulos activos del cliente? `modulos` es `Tenant.modulos`, que viene de
 * `tenant_modulos`; acepta `string[]` porque la base puede traer un módulo que este despliegue aún
 * no conoce.
 *
 * Esconder una opción con esto es solo cosmético: la página y cada Server Action repiten la
 * comprobación en el servidor con `requireModulo()`.
 */
export function tieneModulo(
  modulos: readonly string[] | null | undefined,
  id: ModuloId
): boolean {
  return !!modulos && modulos.includes(id);
}
