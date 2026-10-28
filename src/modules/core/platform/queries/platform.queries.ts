import { createClient } from "@/lib/supabase/server";
import { callRpc, type Result } from "../../rpc/call-rpc";
import { requirePlatformAdmin } from "../../auth/guards";
import type { ModuloCatalogo, TenantDetalle, TenantResumen } from "../types";

// Módulo plano (no "use server"): solo lo llaman páginas del servidor. Cada RPC verifica por dentro que quien
// llama es platform admin; el `requirePlatformAdmin()` de aquí corta antes y con `AuthorizationError`.

export async function listarTenantsResumen(): Promise<Result<TenantResumen[]>> {
  await requirePlatformAdmin();
  return callRpc<"public", "platform_tenants_resumen", TenantResumen[]>("public", "platform_tenants_resumen", {});
}

export async function obtenerTenant(id: string): Promise<Result<TenantDetalle>> {
  await requirePlatformAdmin();
  return callRpc<"public", "platform_obtener_tenant", TenantDetalle>("public", "platform_obtener_tenant", {
    p_tenant: id,
  });
}

/** Catálogo global de módulos (`public.modulos`, legible por cualquier usuario con sesión). */
export async function listarCatalogoModulos(): Promise<ModuloCatalogo[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modulos")
    .select("id, nombre, descripcion, vertical, base")
    .order("id");
  if (error) throw new Error("No se pudo leer el catálogo de módulos");
  return data;
}
