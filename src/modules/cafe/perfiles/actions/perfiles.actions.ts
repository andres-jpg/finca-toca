"use server";

import { revalidatePath } from "next/cache";
import { traducirErrorRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireRolTenant } from "@/modules/core/auth/guards";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { aPerfilTueste } from "../lib/perfil-vigente";
import { perfilTuesteSchema, type PerfilTuesteFormInput } from "../schemas/perfil-tueste.schema";
import type { PerfilTuesteTipo } from "../types";

// Server Actions de los perfiles de tueste (B-18). Módulo activo → rol de la membresía → Zod → escritura. Son
// endpoints POST públicos: la frontera real es el RLS de `cafe.perfil_tueste_tipo` (solo owner/admin escriben).
// Un perfil nunca se actualiza ni se borra: un cambio es una versión nueva con su «vigente desde». `tenant_id` lo
// estampa el DEFAULT `tenant_actual()`.

const ROLES_MAESTRO: RolTenant[] = ["owner", "admin"];
const RUTA = "/dashboard/cafe/maestros/perfiles-tueste";

/** Crea una versión del perfil de un tipo de café (o de maquila con `tipoCafeId = null`). */
export async function crearVersionPerfilTueste(input: PerfilTuesteFormInput): Promise<Result<PerfilTuesteTipo>> {
  await requireModulo("cafe.recepcion");
  await requireRolTenant(ROLES_MAESTRO);

  const parsed = perfilTuesteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "datos_invalidos", message: parsed.error.issues[0]?.message ?? mensajeRpc("datos_invalidos") };
  }
  const { tipoCafeId, nivel, tempC, tiempoMin, vigenteDesde } = parsed.data;

  const supabase = await createClient();
  if (tipoCafeId) {
    // El RLS de tipos_cafe oculta los de otro cliente: aquí se ven igual que uno inexistente.
    const { data: tipo } = await supabase.schema("cafe").from("tipos_cafe").select("id").eq("id", tipoCafeId).maybeSingle();
    if (!tipo) return { ok: false, code: "tipo_cafe_no_encontrado", message: mensajeRpc("tipo_cafe_no_encontrado") };
  }

  const { data, error } = await supabase
    .schema("cafe")
    .from("perfil_tueste_tipo")
    .insert({ tipo_cafe_id: tipoCafeId, nivel, temp_c: tempC, tiempo_min: tiempoMin, vigente_desde: vigenteDesde })
    .select()
    .single();
  if (error) {
    const r = traducirErrorRpc("cafe", "perfil_tueste_tipo", error);
    if (!r.ok && r.code === "duplicado") {
      return { ok: false, code: "duplicado", message: "Ya hay un perfil con esa fecha de vigencia. Elige otra fecha." };
    }
    return r;
  }
  revalidatePath(RUTA);
  return { ok: true, data: aPerfilTueste(data) };
}
