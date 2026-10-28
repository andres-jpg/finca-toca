"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { callRpc, type Result } from "../../rpc/call-rpc";
import { mensajeRpc } from "../../rpc/mensajes";
import { requireRolTenant } from "../../auth/guards";
import { requireModulo } from "../../tenants/tenant.guards";
import {
  invitarMiembroSchema,
  rolSchema,
  userIdSchema,
  type InvitarMiembroInput,
} from "../schemas/equipo.schema";

// Server Actions de la pantalla de equipo. Cada una: módulo `core.equipo` activo → rol owner/admin →
// Zod → RPC. Son endpoints POST públicos: la frontera real son las RPC `*_miembro_tenant`, que repiten el
// rol y el módulo dentro de la base y aplican las reglas (nadie se modifica a sí mismo, solo un owner toca a
// un owner, siempre queda un owner). El cliente se toma siempre de `tenant_actual()`; nunca se pasa.

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

async function autorizar(): Promise<void> {
  await requireModulo("core.equipo");
  await requireRolTenant(["owner", "admin"]);
}

interface RespuestaInvitar {
  /** `true`: el email no tiene cuenta todavía (la RPC no escribió nada). */
  pendiente: boolean;
  user_id: string | null;
  reactivado: boolean;
}

const FALLO_INVITACION: Result<never> = {
  ok: false,
  code: "invitacion_no_enviada",
  message: mensajeRpc("invitacion_no_enviada"),
};

/**
 * Envía la invitación de Supabase Auth, que crea la cuenta del invitado. Es el ÚNICO uso del cliente admin
 * (service role) de este módulo y solo se llega aquí tras `autorizar()` y tras la RPC, que ya comprobó en la
 * base que el llamante es owner/admin con el módulo activo. El email que se pasa es el validado por Zod.
 */
async function enviarInvitacion(email: string): Promise<Result<null>> {
  try {
    const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email);
    // `email_exists`: la cuenta se creó entre la RPC y aquí (otra invitación a la vez). Ya existe: sigue.
    if (error && error.code !== "email_exists") {
      // Sin PII: ni el email ni el mensaje del proveedor, solo el código.
      Sentry.captureException(new Error("inviteUserByEmail falló"), {
        tags: { auth_status: String(error.status ?? "desconocido"), auth_code: error.code ?? "desconocido" },
      });
      return FALLO_INVITACION;
    }
    return { ok: true, data: null };
  } catch {
    Sentry.captureException(new Error("inviteUserByEmail falló (excepción)"));
    return FALLO_INVITACION;
  }
}

/**
 * Invita a un miembro con el rol indicado. Si el email ya tiene cuenta lo une al equipo (o lo reactiva); si
 * no, le envía la invitación por correo y lo une en cuanto la cuenta existe (la RPC es idempotente, así que
 * repetir «Invitar» tras un fallo parcial completa el alta). La respuesta es la misma en ambos casos: saber
 * si un correo ya está registrado en la plataforma no es asunto del administrador de un cliente.
 */
export async function invitarMiembro(input: InvitarMiembroInput): Promise<Result<{ reactivado: boolean }>> {
  await autorizar();
  const parsed = invitarMiembroSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  const args = { p_email: parsed.data.email, p_rol: parsed.data.rol };

  let r = await callRpc<"public", "invitar_miembro_tenant", RespuestaInvitar>("public", "invitar_miembro_tenant", args);
  if (!r.ok) return r;

  if (r.data.pendiente) {
    const enviada = await enviarInvitacion(parsed.data.email);
    if (!enviada.ok) return enviada;
    r = await callRpc<"public", "invitar_miembro_tenant", RespuestaInvitar>("public", "invitar_miembro_tenant", args);
    if (!r.ok) return r;
    if (r.data.pendiente) return FALLO_INVITACION;
  }

  revalidatePath("/dashboard/equipo");
  return { ok: true, data: { reactivado: r.data.reactivado } };
}

export async function cambiarRolMiembro(userId: string, rol: string): Promise<Result<null>> {
  await autorizar();
  const usuario = userIdSchema.safeParse(userId);
  const nuevoRol = rolSchema.safeParse(rol);
  if (!usuario.success || !nuevoRol.success) return datosInvalidos(undefined);

  const r = await callRpc("public", "cambiar_rol_miembro_tenant", { p_user: usuario.data, p_rol: nuevoRol.data });
  if (!r.ok) return r;
  revalidatePath("/dashboard/equipo");
  return { ok: true, data: null };
}

/** Desactiva (`activo = false`) o reactiva a un miembro. No se borra: queda en el historial. */
export async function cambiarEstadoMiembro(userId: string, activo: boolean): Promise<Result<null>> {
  await autorizar();
  const usuario = userIdSchema.safeParse(userId);
  if (!usuario.success || typeof activo !== "boolean") return datosInvalidos(undefined);

  const r = await callRpc("public", "cambiar_estado_miembro_tenant", { p_user: usuario.data, p_activo: activo });
  if (!r.ok) return r;
  revalidatePath("/dashboard/equipo");
  return { ok: true, data: null };
}
