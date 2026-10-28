import type { Json } from "@/lib/supabase/database.types";
import type { AccionAuditoria } from "../../auditoria/lib/formato-cambios";
import { etiquetaRolEquipo } from "./roles";

/** Tabla auditada de las membresías, tal como se guarda en `audit.log`. */
export const TABLA_MIEMBROS = "public.tenant_members";

function comoObjeto(cambios: Json | null): Record<string, Json | undefined> {
  return cambios !== null && typeof cambios === "object" && !Array.isArray(cambios) ? cambios : {};
}

/**
 * Líneas de detalle de un cambio de membresía en lenguaje del equipo, no del esquema: «Rol → Gerencia»,
 * «Estado → Desactivado». En un alta (INSERT) `cambios` trae la fila entera y se resume su rol inicial.
 * Los demás campos (`permisos`, `updated_*`…) no son de esta pantalla.
 */
export function resumirCambioMiembro(accion: AccionAuditoria, cambios: Json | null): string[] {
  if (accion === "DELETE") return [];
  const c = comoObjeto(cambios);
  const lineas: string[] = [];
  if (typeof c.rol === "string") lineas.push(`Rol → ${etiquetaRolEquipo(c.rol)}`);
  if (typeof c.activo === "boolean" && accion === "UPDATE") {
    lineas.push(`Estado → ${c.activo ? "Activo" : "Desactivado"}`);
  }
  return lineas;
}
