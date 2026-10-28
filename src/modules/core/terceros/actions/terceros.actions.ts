"use server";

import { revalidatePath } from "next/cache";
import { callRpc, traducirErrorRpc, type Result } from "../../rpc/call-rpc";
import { mensajeRpc } from "../../rpc/mensajes";
import { requireRolTenant } from "../../auth/guards";
import { requireModulo } from "../../tenants/tenant.guards";
import { createClient } from "@/lib/supabase/server";
import type { RolTenant } from "../../auth/sesion";
import { listarTerceros } from "../queries/terceros.queries";
import type { RolTercero } from "../lib/roles";
import {
  buscarSimilaresSchema,
  terceroSchema,
  type BuscarSimilaresInput,
  type TerceroFormInput,
} from "../schemas/tercero.schema";
import type { Tercero, TerceroOpcion } from "../types";

// Server Actions de terceros. Cada una: módulo activo → rol de la membresía → Zod → escritura. Son
// endpoints POST públicos: la frontera real es el RLS de `terceros` (que también exige el módulo), esto
// es defensa en profundidad. Devuelven `Result<T>` (como `callRpc`) para que el formulario muestre el
// mensaje en vez de lanzar. `tenant_id` lo estampa el DEFAULT `tenant_actual()`: no se pasa desde aquí.

/** Quién da de alta (la HU permite crear en línea desde una recepción o una venta). */
const ROLES_ALTA: RolTenant[] = ["owner", "admin", "operativo"];
/** Quién edita datos maestros y desactiva. */
const ROLES_EDICION: RolTenant[] = ["owner", "admin"];
/** Quién consulta (todos los miembros del cliente). */
const ROLES_LECTURA: RolTenant[] = ["owner", "admin", "operativo", "viewer"];

async function autorizar(roles: RolTenant[]): Promise<void> {
  await requireModulo("core.terceros");
  await requireRolTenant(roles);
}

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

/** Un 23505 en `terceros` solo puede ser la identificación (o el consumidor final): se dice claro. */
function traducir(error: Parameters<typeof traducirErrorRpc>[2]): Result<never> {
  const r = traducirErrorRpc("public", "terceros", error);
  if (!r.ok && r.code === "duplicado") {
    return { ok: false, code: "duplicado", message: "Ya existe un tercero con esa identificación." };
  }
  return r;
}

export async function crearTercero(input: TerceroFormInput): Promise<Result<Tercero>> {
  await autorizar(ROLES_ALTA);
  const parsed = terceroSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const supabase = await createClient();
  const { data, error } = await supabase.from("terceros").insert(parsed.data).select().single();
  if (error) return traducir(error);
  revalidatePath("/dashboard/terceros");
  return { ok: true, data: data as Tercero };
}

/** Cambia los datos maestros y los roles. El "Consumidor final" no se edita (lo impide un trigger). */
export async function actualizarTercero(id: string, input: TerceroFormInput): Promise<Result<Tercero>> {
  await autorizar(ROLES_EDICION);
  const parsed = terceroSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const supabase = await createClient();
  const { data, error } = await supabase.from("terceros").update(parsed.data).eq("id", id).select().maybeSingle();
  if (error) return traducir(error);
  // El RLS filtra los terceros de otro cliente: aquí se ven igual que uno inexistente.
  if (!data) return { ok: false, code: "tercero_no_encontrado", message: mensajeRpc("tercero_no_encontrado") };
  revalidatePath("/dashboard/terceros");
  return { ok: true, data: data as Tercero };
}

async function cambiarActivo(id: string, activo: boolean): Promise<Result<Tercero>> {
  await autorizar(ROLES_EDICION);
  const supabase = await createClient();
  const { data, error } = await supabase.from("terceros").update({ activo }).eq("id", id).select().maybeSingle();
  if (error) return traducir(error);
  if (!data) return { ok: false, code: "tercero_no_encontrado", message: mensajeRpc("tercero_no_encontrado") };
  revalidatePath("/dashboard/terceros");
  return { ok: true, data: data as Tercero };
}

/** Un tercero no se borra: se desactiva (deja de salir en los selectores, conserva su historia). */
export async function desactivarTercero(id: string): Promise<Result<Tercero>> {
  return cambiarActivo(id, false);
}

export async function reactivarTercero(id: string): Promise<Result<Tercero>> {
  return cambiarActivo(id, true);
}

/**
 * Terceros que podrían ser el que se está dando de alta: misma identificación normalizada o nombre
 * parecido (máx. 5; incluye inactivos). Sirve al aviso del formulario *antes* de guardar.
 */
export async function buscarSimilares(input: BuscarSimilaresInput): Promise<Result<Tercero[]>> {
  await autorizar(ROLES_LECTURA);
  const parsed = buscarSimilaresSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  // Sin criterios no hay nada que comparar: se evita el viaje a la base.
  if (!parsed.data.nombre && !parsed.data.identificacion) return { ok: true, data: [] };

  const r = await callRpc<"public", "buscar_terceros_similares", Tercero[]>("public", "buscar_terceros_similares", {
    p_nombre: parsed.data.nombre,
    p_identificacion: parsed.data.identificacion,
  });
  return r;
}

export interface FiltrosOpcionesTerceros {
  rol?: RolTercero;
  incluirConsumidorFinal?: boolean;
}

/** Terceros activos para un selector (`TerceroCombobox`). Lo llama el cliente al montarse. */
export async function listarOpcionesTerceros(filtros: FiltrosOpcionesTerceros = {}): Promise<Result<TerceroOpcion[]>> {
  await autorizar(ROLES_LECTURA);
  try {
    const terceros = await listarTerceros({
      rol: filtros.rol,
      activo: true,
      incluirConsumidorFinal: filtros.incluirConsumidorFinal ?? false,
    });
    return {
      ok: true,
      data: terceros.map(
        ({ id, nombre, tipo_identificacion, identificacion, digito_verificacion, roles, es_consumidor_final, activo }) => ({
          id,
          nombre,
          tipo_identificacion,
          identificacion,
          digito_verificacion,
          roles,
          es_consumidor_final,
          activo,
        }),
      ),
    };
  } catch {
    return { ok: false, code: "error_inesperado", message: mensajeRpc("error_inesperado") };
  }
}

/**
 * Garantiza el "Consumidor final" del cliente actual y devuelve su id (idempotente). Lo usan las ventas
 * al público sin factura a nombre de nadie; el alta de clientes lo siembra directamente en SQL.
 */
export async function asegurarConsumidorFinal(): Promise<Result<string>> {
  await autorizar(ROLES_ALTA);
  const r = await callRpc<"public", "asegurar_consumidor_final", string>("public", "asegurar_consumidor_final", {});
  if (r.ok) revalidatePath("/dashboard/terceros");
  return r;
}
