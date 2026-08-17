/**
 * Módulos que no tiene todo el mundo: existen en el código pero solo se le enseñan a los
 * clientes de la lista.
 *
 * Es un fichero **puro a propósito** (sin `next/headers` ni Supabase) para que lo pueda
 * importar tanto la barra lateral —componente de cliente, solo tiene el slug— como las
 * páginas y los Server Actions, que resuelven el cliente con `getTenantActual()`.
 *
 * No sustituye a RLS: el aislamiento entre clientes ya lo garantiza `tenant_id =
 * tenant_actual()` en la base. Esto solo decide a quién se le muestra la opción, así que
 * habilitar un módulo para otro cliente es añadir su slug aquí, sin tocar la base.
 */
export type ModuloOpcional = "arriendos";

const TENANTS_POR_MODULO: Record<ModuloOpcional, readonly string[]> = {
  arriendos: ["villa-blanca"],
};

export function slugTieneModulo(
  slug: string | null | undefined,
  modulo: ModuloOpcional
): boolean {
  return !!slug && TENANTS_POR_MODULO[modulo].includes(slug);
}
