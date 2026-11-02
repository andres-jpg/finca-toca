"use server";

import { revalidatePath } from "next/cache";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "../../insumos/lib/insumos";
import {
  anularRemisionSchema,
  entregarLotesSchema,
  payloadEntrega,
  type AnularRemisionInput,
  type EntregarLotesInput,
} from "../schemas/remision.schema";

// Server Actions de las remisiones (FIN-113, FIN-132). Cada una: módulo activo → rol de la membresía → Zod → RPC. Son
// endpoints POST públicos: la frontera real son las RPC `cafe.entregar_lotes` / `cafe.anular_remision` (repiten
// permisos, módulo y todas las reglas) y el RLS; esto es defensa en profundidad. La escritura es UNA RPC
// transaccional (número REM + remisión): nunca inserts sueltos desde aquí.

/** Generar: igual que la RPC y el RLS (INSERT). Gerencia (`viewer`) solo consulta. Forzar lo limita la RPC a owner/admin. */
const ROLES_GENERAR: RolTenant[] = ["owner", "admin", "operativo"];
/** Anular es una corrección: solo `owner`/`admin`. */
const ROLES_ANULAR: RolTenant[] = ["owner", "admin"];

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

function revalidarRemisiones(loteIds: readonly string[]) {
  revalidatePath("/dashboard/cafe/remisiones");
  revalidatePath("/dashboard/cafe/lotes");
  for (const id of loteIds) revalidatePath(`/dashboard/cafe/lotes/${id}`);
  revalidatePath("/dashboard/cafe/planta");
  revalidatePath("/dashboard/cafe/planta/entregar");
}

export interface RemisionGenerada {
  id: string;
  numero: string;
  forzada: boolean;
  lote_ids: string[];
}

/**
 * «Entregar»: genera UNA remisión con todos los lotes elegidos de un cliente (A-14). Quién recibe (nombre y cédula) es
 * obligatorio. La base comprueba que sean de servicio, de un mismo cliente, sin remisión entregada, con procesos y
 * con los servicios completos (`servicios_incompletos`; un administrador puede forzar con una observación). El número
 * REM sale de la serie independiente de MP/MQ. Todo o nada.
 */
export async function entregarLotes(input: EntregarLotesInput): Promise<Result<RemisionGenerada>> {
  await requireModulo("cafe.remisiones");
  const sesion = await requireRolTenant(ROLES_GENERAR);

  const parsed = entregarLotesSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  // La fecha es un día del calendario del cliente: no se entrega en el futuro. (La base solo la valida como
  // fecha: el navegador puede estar en otra zona y el servidor está en UTC.)
  if (parsed.data.fecha > fechaHoyEnZona(sesion.tenant.zonaHoraria)) {
    return datosInvalidos("La fecha de entrega no puede ser futura.");
  }

  const r = await callRpc<"cafe", "entregar_lotes", RemisionGenerada>("cafe", "entregar_lotes", {
    p: payloadEntrega(parsed.data),
  });
  if (r.ok) revalidarRemisiones(parsed.data.loteIds);
  return r;
}

export interface RemisionAnulada {
  id: string;
  numero: string;
  lote_id: string;
  lote_estado: string;
  lote_ids: string[];
}

/**
 * Anula una remisión con motivo (solo owner/admin). Se conserva auditada, su número no se reutiliza y el lote vuelve a
 * su estado derivado: se puede generar otra remisión o corregir sus procesos.
 */
export async function anularRemision(input: AnularRemisionInput): Promise<Result<RemisionAnulada>> {
  await requireModulo("cafe.remisiones");
  await requireRolTenant(ROLES_ANULAR);

  const parsed = anularRemisionSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc<"cafe", "anular_remision", RemisionAnulada>("cafe", "anular_remision", {
    p_remision: parsed.data.remisionId,
    p_motivo: parsed.data.motivo,
  });
  if (r.ok) revalidarRemisiones(r.data.lote_ids?.length ? r.data.lote_ids : [r.data.lote_id]);
  return r;
}
