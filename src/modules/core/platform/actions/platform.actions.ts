"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "../../auth/guards";
import { callRpc, type Result } from "../../rpc/call-rpc";
import { mensajeRpc } from "../../rpc/mensajes";
import {
  actualizarTenantSchema,
  agregarMiembroSchema,
  crearTenantSchema,
  tenantIdSchema,
  type ActualizarTenantInput,
  type AgregarMiembroInput,
  type CrearTenantInput,
} from "../schemas/platform.schema";

// Server Actions del backoffice de plataforma. Son endpoints POST públicos: cada una empieza por
// `requirePlatformAdmin()` (lanza `AuthorizationError`) y luego valida con Zod. La frontera real son las
// RPC `public.platform_*`, que repiten la comprobación de platform admin dentro de la base. Devuelven
// `Result<T>` para que el formulario muestre el mensaje en vez de lanzar.

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

/** Crea el cliente con su configuración inicial por vertical. Devuelve el id para ir a su detalle. */
export async function crearTenant(input: CrearTenantInput): Promise<Result<{ id: string }>> {
  await requirePlatformAdmin();
  const parsed = crearTenantSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  const d = parsed.data;

  const r = await callRpc<"public", "platform_crear_tenant", string>("public", "platform_crear_tenant", {
    p_nombre: d.nombre,
    p_slug: d.slug,
    p_vertical: d.vertical,
    p_nit: d.nit ?? undefined,
    p_plan: d.plan ?? undefined,
    p_modulos: d.modulos.length > 0 ? d.modulos : undefined,
  });
  if (!r.ok) return r;
  revalidatePath("/admin/tenants");
  return { ok: true, data: { id: r.data } };
}

export async function actualizarTenant(tenantId: string, input: ActualizarTenantInput): Promise<Result<null>> {
  await requirePlatformAdmin();
  const id = tenantIdSchema.safeParse(tenantId);
  if (!id.success) return datosInvalidos(id.error.issues[0]?.message);
  const parsed = actualizarTenantSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc("public", "platform_actualizar_tenant", {
    p_tenant: id.data,
    p_cambios: parsed.data,
  });
  if (!r.ok) return r;
  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${id.data}`);
  return { ok: true, data: null };
}

/** Activa o desactiva un módulo. Se ve en el cliente al recargar. */
export async function setModuloTenant(tenantId: string, modulo: string, activo: boolean): Promise<Result<null>> {
  await requirePlatformAdmin();
  const id = tenantIdSchema.safeParse(tenantId);
  if (!id.success || typeof modulo !== "string" || modulo === "" || typeof activo !== "boolean") {
    return datosInvalidos(undefined);
  }

  const r = await callRpc("public", "platform_set_modulo", { p_tenant: id.data, p_modulo: modulo, p_activo: activo });
  if (!r.ok) return r;
  revalidatePath(`/admin/tenants/${id.data}`);
  return { ok: true, data: null };
}

/** Vincula a un usuario que ya tiene cuenta (por email). */
export async function agregarMiembroTenant(tenantId: string, input: AgregarMiembroInput): Promise<Result<null>> {
  await requirePlatformAdmin();
  const id = tenantIdSchema.safeParse(tenantId);
  if (!id.success) return datosInvalidos(id.error.issues[0]?.message);
  const parsed = agregarMiembroSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc("public", "platform_agregar_miembro", {
    p_tenant: id.data,
    p_email: parsed.data.email,
    p_rol: parsed.data.rol,
  });
  if (!r.ok) return r;
  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${id.data}`);
  return { ok: true, data: null };
}

export async function quitarMiembroTenant(tenantId: string, userId: string): Promise<Result<null>> {
  await requirePlatformAdmin();
  const id = tenantIdSchema.safeParse(tenantId);
  const usuario = tenantIdSchema.safeParse(userId);
  if (!id.success || !usuario.success) return datosInvalidos(undefined);

  const r = await callRpc("public", "platform_quitar_miembro", { p_tenant: id.data, p_user: usuario.data });
  if (!r.ok) return r;
  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${id.data}`);
  return { ok: true, data: null };
}
