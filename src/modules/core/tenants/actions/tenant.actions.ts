"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { callRpc, type Result } from "../../rpc/call-rpc";
import { mensajeRpc } from "../../rpc/mensajes";
import type { TenantEstado, Vertical } from "../tenant.queries";

const tenantIdSchema = z.uuid({ message: "Cliente no válido." });

export interface TenantListado {
  id: string;
  nombre: string;
  slug: string;
  vertical: Vertical;
  estado: TenantEstado;
}

/**
 * Cambia el cliente activo del usuario y lo manda al inicio del dashboard. Si falla, devuelve el
 * mensaje para el toast; si funciona, `redirect()` no vuelve (lanza NEXT_REDIRECT), por eso va al final
 * y fuera de cualquier try/catch.
 *
 * No hace su propia comprobación de rol: la autorización vive en la RPC `cambiar_tenant_activo()`,
 * que solo acepta un tenant donde el usuario tiene membresía activa (o si es platform admin) y rechaza
 * cualquier otro `tenantId` con `tenant_no_permitido`. Un `requireSesion()` aquí rompería al platform
 * admin que aún no tiene cliente activo y justo está eligiendo uno.
 */
export async function cambiarTenantActivo(tenantId: string): Promise<{ ok: false; message: string }> {
  const parsed = tenantIdSchema.safeParse(tenantId);
  if (!parsed.success) return { ok: false, message: mensajeRpc("tenant_no_encontrado") };

  const r = await callRpc("public", "cambiar_tenant_activo", { p_tenant: parsed.data });
  if (!r.ok) return { ok: false, message: r.message };

  // El layout lee el cliente activo (nombre, módulos, rol): hay que invalidarlo entero.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Todos los clientes, para el selector del platform admin. La RPC `platform_listar_tenants()` verifica
 * `es_platform_admin()` por dentro: a cualquier otro usuario le devuelve `no_autorizado`.
 */
export async function listarTenantsPlataforma(): Promise<Result<TenantListado[]>> {
  return callRpc<"public", "platform_listar_tenants", TenantListado[]>(
    "public",
    "platform_listar_tenants",
    {},
  );
}
