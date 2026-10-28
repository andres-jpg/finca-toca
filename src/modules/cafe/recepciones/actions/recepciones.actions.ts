"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant, Sesion } from "@/modules/core/auth/sesion";
import { callRpc, traducirErrorRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "../../insumos/lib/insumos";
import { payloadRecepcion, recepcionSchema, type RecepcionFormInput } from "../schemas/recepcion.schema";
import type { RespuestaRecepcion } from "../types";

// Server Actions de la recepción de café de clientes (FIN-107). Cada una: módulo activo → rol de la membresía →
// Zod → escritura. Son endpoints POST públicos: la frontera real es la RPC `cafe.registrar_recepcion` (que
// repite permisos, módulo y reglas) y el RLS; esto es defensa en profundidad. Devuelven `Result<T>` para que el
// formulario muestre el mensaje en vez de lanzar. La escritura es UNA RPC transaccional (lote + bultos +
// consecutivo): nunca inserts sueltos desde aquí. `tenant_id` lo estampa el DEFAULT `tenant_actual()`.

/** Recepciones: igual que el RLS de `cafe.lotes` (INSERT). Gerencia (`viewer`) solo consulta. */
const ROLES_RECEPCION: RolTenant[] = ["owner", "admin", "operativo"];
/** Marcar a un tercero como cliente de servicios es editar un maestro: `owner`/`admin` (RLS de `terceros`). */
const ROLES_MAESTRO: RolTenant[] = ["owner", "admin"];

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

/**
 * Registra la recepción de un cliente: crea el lote `MQ-…`, sus bultos, las alertas de calidad (que avisan,
 * no bloquean) y devuelve la estimación del valor de los servicios. Todo o nada.
 */
export async function registrarRecepcion(input: RecepcionFormInput): Promise<Result<RespuestaRecepcion>> {
  await requireModulo("cafe.recepcion");
  const sesion: Sesion = await requireRolTenant(ROLES_RECEPCION);

  const parsed = recepcionSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  // La fecha es un día del calendario del cliente: no se recibe café del futuro. (La base solo la valida como
  // fecha: el navegador puede estar en otra zona y el servidor está en UTC.)
  if (parsed.data.fecha > fechaHoyEnZona(sesion.tenant.zonaHoraria)) {
    return datosInvalidos("La fecha de la recepción no puede ser futura.");
  }

  const r = await callRpc<"cafe", "registrar_recepcion", RespuestaRecepcion>("cafe", "registrar_recepcion", {
    p: payloadRecepcion(parsed.data),
  });
  if (r.ok) revalidatePath("/dashboard/cafe/lotes");
  return r;
}

/**
 * Añade el rol «Cliente de servicios» a un tercero que ya existe con otro (p. ej. un cliente de marca propia
 * que trae café a maquilar). Solo `owner`/`admin`: la RPC de recepción no añade roles (un operativo no puede
 * editar terceros) y el RLS de `terceros` lo impide igualmente. Idempotente.
 */
export async function agregarRolClienteServicio(terceroId: string): Promise<Result<{ id: string; roles: string[] }>> {
  await requireModulo("core.terceros");
  await requireModulo("cafe.recepcion");
  await requireRolTenant(ROLES_MAESTRO);

  const id = z.uuid().safeParse(terceroId);
  if (!id.success) return datosInvalidos("El tercero no es válido.");

  const supabase = await createClient();
  const { data: tercero, error: errorLectura } = await supabase.from("terceros").select("id, roles").eq("id", id.data).maybeSingle();
  if (errorLectura) return traducirErrorRpc("public", "terceros", errorLectura);
  // El RLS filtra los terceros de otro cliente: aquí se ven igual que uno inexistente.
  if (!tercero) return { ok: false, code: "tercero_no_encontrado", message: mensajeRpc("tercero_no_encontrado") };
  if (tercero.roles.includes("cliente_servicio")) return { ok: true, data: { id: tercero.id, roles: tercero.roles } };

  const { data, error } = await supabase
    .from("terceros")
    .update({ roles: [...tercero.roles, "cliente_servicio"] })
    .eq("id", tercero.id)
    .select("id, roles")
    .maybeSingle();
  if (error) return traducirErrorRpc("public", "terceros", error);
  if (!data) return { ok: false, code: "tercero_no_encontrado", message: mensajeRpc("tercero_no_encontrado") };

  revalidatePath("/dashboard/terceros");
  return { ok: true, data };
}
