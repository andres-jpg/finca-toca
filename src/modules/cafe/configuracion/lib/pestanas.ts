import { tieneModulo } from "@/modules/core/tenants/modulos";
import type { ModuloId } from "@/modules/core/tenants/modulos";
import type { RolTenant } from "@/modules/core/auth/sesion";

/**
 * Pestañas de Configuración del café (A-07 · FIN-125). Cada una es una pantalla que ya existe en su ruta de
 * siempre: Configuración las agrupa, no las duplica (sin redirecciones que mantener). Solo se ofrecen las de
 * módulos que el cliente tiene activos (Insumos ya no está aquí: desde A-15 es una pestaña del Inventario); Configuración la ven propietario y administrador.
 * «Perfiles de tueste» (B-18): nivel + temperatura + tiempo por tipo de café, con vigencia.
 */
export interface PestanaConfiguracion {
  href: string;
  label: string;
  modulo: ModuloId;
}

export const PESTANAS_CONFIGURACION: readonly PestanaConfiguracion[] = [
  { href: "/dashboard/cafe/maestros/tipos", label: "Tipos de café", modulo: "cafe.recepcion" },
  { href: "/dashboard/cafe/maestros/perfiles-tueste", label: "Perfiles de tueste", modulo: "cafe.recepcion" },
  { href: "/dashboard/terceros", label: "Terceros", modulo: "core.terceros" },
  { href: "/dashboard/tarifas", label: "Tarifas y parámetros", modulo: "core.terceros" },
  // B-15: carga del inventario que el cliente ya tiene (solo propietario y administrador, como toda Configuración).
  { href: "/dashboard/cafe/configuracion/carga-inicial", label: "Carga inicial", modulo: "cafe.inventario" },
  { href: "/dashboard/equipo", label: "Equipo", modulo: "core.equipo" },
];

const ROLES_CONFIGURACION: readonly RolTenant[] = ["owner", "admin"];

/** Pestañas visibles para un cliente y rol; vacío si el rol no accede a Configuración. */
export function pestanasConfiguracion(modulos: readonly string[], rol: RolTenant | null): PestanaConfiguracion[] {
  if (!rol || !ROLES_CONFIGURACION.includes(rol)) return [];
  return PESTANAS_CONFIGURACION.filter((p) => tieneModulo(modulos, p.modulo));
}
