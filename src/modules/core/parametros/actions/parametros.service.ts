import { revalidatePath } from "next/cache";
import type { Json } from "@/lib/supabase/database.types";
import { requireRolTenant } from "../../auth/guards";
import { callRpc, type Result } from "../../rpc/call-rpc";
import { mensajeRpc } from "../../rpc/mensajes";
import { requireModulo } from "../../tenants/tenant.guards";
import { getDefinicionParametro } from "../registry";

// Lógica de las acciones de parámetros. NO lleva "use server": el Server Action real vive en
// `src/app/dashboard/tarifas/actions.ts`, que además importa el registro de módulos para que las definiciones
// estén cargadas en el mismo bundle que esta función (`core` no puede importar `src/modules/registry.ts`).

export const RUTA_CONFIGURACION = "/dashboard/tarifas";

function datosInvalidos(mensaje: string): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje };
}

/**
 * Guarda el valor de un parámetro del cliente actual. Autoriza (owner/admin y módulo dueño activo), valida
 * contra el `schema` de la definición y escribe con la RPC `guardar_parametro` (el RLS vuelve a exigir
 * owner/admin). `valor` llega tal cual del formulario (número, `{min,max}` o `null`).
 */
export async function guardarParametro(clave: string, valor: unknown): Promise<Result<{ clave: string; valor: unknown }>> {
  await requireRolTenant(["owner", "admin"]);
  const def = getDefinicionParametro(clave);
  if (!def) return datosInvalidos("Ese parámetro no existe.");
  await requireModulo(def.modulo);

  const parsed = def.schema.safeParse(valor);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message ?? mensajeRpc("datos_invalidos"));

  const r = await callRpc<"public", "guardar_parametro", { clave: string; valor: unknown }>("public", "guardar_parametro", {
    p_clave: clave,
    // Se guarda lo ya validado y normalizado por el schema (p. ej. un rango vacío → null).
    p_valor: parsed.data as Json,
  });
  if (r.ok) revalidatePath(RUTA_CONFIGURACION);
  return r;
}
