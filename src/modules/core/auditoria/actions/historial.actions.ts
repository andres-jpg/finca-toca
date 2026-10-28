"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRolTenant } from "../../auth/guards";
import type { Json } from "@/lib/supabase/database.types";
import type { AccionAuditoria } from "../lib/formato-cambios";

export interface CambioAuditado {
  id: number;
  at: string;
  tabla: string;
  registroId: string;
  accion: AccionAuditoria;
  /** UPDATE: solo las claves modificadas con su valor nuevo; INSERT: la fila creada; DELETE: la fila borrada. */
  cambios: Json | null;
  userId: string | null;
  /** NULL si el cambio lo hizo el sistema (cron, seed) o alguien que ya no es miembro del cliente. */
  email: string | null;
}

/**
 * Historial de cambios de un registro (o de toda una tabla si no se da `registroId`), del más
 * reciente al más antiguo. Solo owner/admin de la membresía (no el rol legacy: un cliente de café no tiene
 * fila en `roles`): la RPC `historial_cambios` lo vuelve a comprobar en la base
 * y limita el resultado al cliente del llamante.
 *
 * @param tabla nombre completo, como se guarda en el log: `public.gastos`
 */
export async function getHistorialCambios(
  tabla: string,
  registroId?: string,
  limite = 50
): Promise<CambioAuditado[]> {
  await requireRolTenant(["owner", "admin"]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("historial_cambios", {
    p_tabla: tabla,
    p_registro_id: registroId,
    p_limite: limite,
  });
  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);

  return (data ?? []).map((fila) => ({
    id: fila.id,
    at: fila.at,
    tabla: fila.tabla,
    registroId: fila.registro_id,
    // El CHECK de audit.log garantiza estos tres valores.
    accion: fila.accion as AccionAuditoria,
    cambios: fila.cambios,
    userId: fila.user_id,
    email: fila.email,
  }));
}
