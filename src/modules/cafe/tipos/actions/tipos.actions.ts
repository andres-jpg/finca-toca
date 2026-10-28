"use server";

import { revalidatePath } from "next/cache";
import { traducirErrorRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireRolTenant } from "@/modules/core/auth/guards";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { tipoCafeSchema, type TipoCafeFormInput } from "../schemas/tipo-cafe.schema";
import type { TipoCafe } from "../types";

// Server Actions del catálogo de tipos de café. Cada una: módulo activo → rol de la membresía → Zod →
// escritura. Son endpoints POST públicos: la frontera real es el RLS de `cafe.tipos_cafe` (que también
// exige el módulo); esto es defensa en profundidad. Devuelven `Result<T>` para que el formulario muestre el
// mensaje en vez de lanzar. `tenant_id` lo estampa el DEFAULT `tenant_actual()`. Al crear o activar un
// tipo, un trigger de la base genera sus productos terminados (uno por presentación de bolsa): no se
// crean desde aquí.

/** El catálogo es un maestro: solo owner/admin (igual que el RLS). */
const ROLES_MAESTRO: RolTenant[] = ["owner", "admin"];
const RUTA = "/dashboard/cafe/maestros/tipos";

async function autorizar(): Promise<void> {
  await requireModulo("cafe.recepcion");
  await requireRolTenant(ROLES_MAESTRO);
}

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

/** Un 23505 en `tipos_cafe` solo puede ser el nombre (único por cliente sin distinguir mayúsculas). */
function traducir(error: Parameters<typeof traducirErrorRpc>[2]): Result<never> {
  const r = traducirErrorRpc("cafe", "tipos_cafe", error);
  if (!r.ok && r.code === "duplicado") {
    return { ok: false, code: "duplicado", message: "Ya existe un tipo de café con ese nombre." };
  }
  return r;
}

function noEncontrado(): Result<never> {
  return { ok: false, code: "tipo_cafe_no_encontrado", message: mensajeRpc("tipo_cafe_no_encontrado") };
}

export async function crearTipoCafe(input: TipoCafeFormInput): Promise<Result<TipoCafe>> {
  await autorizar();
  const parsed = tipoCafeSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const supabase = await createClient();
  // El nuevo tipo va al final de la lista: orden = mayor actual + 1.
  const { data: ultimo } = await supabase
    .schema("cafe")
    .from("tipos_cafe")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .schema("cafe")
    .from("tipos_cafe")
    .insert({ nombre: parsed.data.nombre, orden: (ultimo?.orden ?? 0) + 1 })
    .select()
    .single();
  if (error) return traducir(error);
  revalidatePath(RUTA);
  return { ok: true, data };
}

export async function actualizarTipoCafe(id: string, input: TipoCafeFormInput): Promise<Result<TipoCafe>> {
  await autorizar();
  const parsed = tipoCafeSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("tipos_cafe")
    .update({ nombre: parsed.data.nombre })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return traducir(error);
  // El RLS filtra los tipos de otro cliente: aquí se ven igual que uno inexistente.
  if (!data) return noEncontrado();
  revalidatePath(RUTA);
  return { ok: true, data };
}

async function cambiarActivo(id: string, activo: boolean): Promise<Result<TipoCafe>> {
  await autorizar();
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("tipos_cafe")
    .update({ activo })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) return traducir(error);
  if (!data) return noEncontrado();
  revalidatePath(RUTA);
  return { ok: true, data };
}

/** Un tipo no se borra: se desactiva (conserva sus productos terminados y su historia). */
export async function desactivarTipoCafe(id: string): Promise<Result<TipoCafe>> {
  return cambiarActivo(id, false);
}

/** Reactivar un tipo vuelve a generar los productos que falten (la base lo hace con un trigger). */
export async function reactivarTipoCafe(id: string): Promise<Result<TipoCafe>> {
  return cambiarActivo(id, true);
}
