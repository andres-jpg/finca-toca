import type { RolTenant } from "../../auth/sesion";

/**
 * Roles de membresía en el orden en que se ofrecen. Los verticales usan la misma enum (`rol_tenant`); lo que
 * cambia es cómo los llama cada cliente. Aquí van los nombres de Cofradía (HU-F1-11), que son los de la
 * pantalla de equipo: Administrador (`admin`), Operativo (`operativo`), Gerencia (`viewer`, solo consulta) y
 * Propietario (`owner`, dueño de la cuenta).
 */
export const ROLES_EQUIPO = ["owner", "admin", "operativo", "viewer"] as const satisfies readonly RolTenant[];

export const ETIQUETA_ROL_EQUIPO: Record<RolTenant, string> = {
  owner: "Propietario",
  admin: "Administrador",
  operativo: "Operativo",
  viewer: "Gerencia",
};

/** Qué puede hacer cada rol, en una línea (ayuda del formulario de invitación y del selector). */
export const AYUDA_ROL_EQUIPO: Record<RolTenant, string> = {
  owner: "Todo, incluido gestionar el equipo y otros propietarios.",
  admin: "Todo, incluidos maestros, tarifas, correcciones y el equipo (salvo propietarios).",
  operativo: "Registra la operación diaria; no edita maestros ni hace correcciones.",
  viewer: "Solo consulta: ve todo, el panel y exporta.",
};

export function etiquetaRolEquipo(rol: string): string {
  return ETIQUETA_ROL_EQUIPO[rol as RolTenant] ?? rol;
}

/**
 * Roles que `llamante` puede asignar al invitar o cambiar un rol: solo un propietario crea propietarios.
 * Es solo la oferta de la interfaz; la regla la aplican las RPC en la base.
 */
export function rolesAsignables(llamante: RolTenant): RolTenant[] {
  return llamante === "owner" ? [...ROLES_EQUIPO] : ROLES_EQUIPO.filter((r) => r !== "owner");
}

/**
 * ¿Puede `llamante` cambiar el rol o el estado de este miembro? Nadie se modifica a sí mismo y solo un
 * propietario toca a otro propietario. Igual que arriba, la base lo vuelve a comprobar.
 */
export function puedeModificarMiembro(
  llamante: RolTenant,
  miembro: { userId: string; rol: RolTenant },
  yoId: string,
): boolean {
  if (miembro.userId === yoId) return false;
  if (miembro.rol === "owner" && llamante !== "owner") return false;
  return true;
}
