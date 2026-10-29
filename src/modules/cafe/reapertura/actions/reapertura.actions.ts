"use server";

import { revalidatePath } from "next/cache";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "../../insumos/lib/insumos";
import type { ResultadoProceso } from "../../procesos/types";
import {
  moliendaReaperturaSchema,
  payloadMoliendaReapertura,
  payloadReabrir,
  reabrirSchema,
  type MoliendaReaperturaInput,
  type ReabrirFormInput,
} from "../schemas/reapertura.schema";
import type { ResultadoReapertura } from "../types";

// Server Actions de la reapertura de producto empacado (FIN-114 · CO-33). Cada una: módulo activo → rol de la
// membresía → Zod → RPC. Son endpoints POST públicos: la frontera real son las RPC `cafe.reabrir_producto` y
// `cafe.registrar_proceso` (que repiten permisos, módulo y todas las reglas) y el RLS; esto es defensa en
// profundidad. Devuelven `Result<T>` para que el formulario muestre el mensaje en vez de lanzar. Cada escritura es UNA
// RPC transaccional: nunca inserts sueltos desde aquí. El EMPAQUE de lo reabierto usa `registrarEmpaque` (módulo
// `empaque`) con `reaperturaId`.

/** Reabrir y moler: igual que las RPC y el RLS. Gerencia (`viewer`) solo consulta. */
const ROLES_OPERACION: RolTenant[] = ["owner", "admin", "operativo"];

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

function revalidarReapertura(loteId: string) {
  revalidatePath("/dashboard/cafe/planta");
  revalidatePath("/dashboard/cafe/lotes");
  revalidatePath(`/dashboard/cafe/lotes/${loteId}`);
  revalidatePath("/dashboard/cafe/inventario");
}

/**
 * Reabre parte de lo empacado de un lote de MARCA PROPIA (HU-F1-16): descuenta el producto terminado y deja el café
 * como "peso inicial" de una molienda y/o un empaque nuevos, conservando de qué lote viene. La base valida que el lote
 * sea de marca propia, que no se reabra más de lo empacado de ESE lote en esa presentación y que haya stock global
 * (lo ya vendido no se reabre). Todo o nada.
 */
export async function reabrirProducto(input: ReabrirFormInput): Promise<Result<ResultadoReapertura>> {
  await requireModulo("cafe.procesos");
  const sesion = await requireRolTenant(ROLES_OPERACION);

  const parsed = reabrirSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  // La fecha es un día del calendario del cliente: no se reabre en el futuro. (La base solo la valida como fecha.)
  if (parsed.data.fecha > fechaHoyEnZona(sesion.tenant.zonaHoraria)) {
    return datosInvalidos("La fecha de la reapertura no puede ser futura.");
  }

  const r = await callRpc<"cafe", "reabrir_producto", ResultadoReapertura>("cafe", "reabrir_producto", {
    p: payloadReabrir(parsed.data),
  });
  if (r.ok) revalidarReapertura(parsed.data.loteId);
  return r;
}

/**
 * Muele lo reabierto (sin repetir trilla ni tostión): un proceso de molienda colgado de la reapertura, sin bultos y sin
 * tarifa. Entra todo lo reabierto; la salida es lo que quedó molido y la diferencia es merma. Una reapertura admite una
 * sola molienda.
 */
export async function registrarMoliendaReapertura(input: MoliendaReaperturaInput): Promise<Result<ResultadoProceso>> {
  await requireModulo("cafe.procesos");
  const sesion = await requireRolTenant(ROLES_OPERACION);

  const parsed = moliendaReaperturaSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  if (parsed.data.fecha > fechaHoyEnZona(sesion.tenant.zonaHoraria)) {
    return datosInvalidos("La fecha del proceso no puede ser futura.");
  }

  const r = await callRpc<"cafe", "registrar_proceso", ResultadoProceso>("cafe", "registrar_proceso", {
    p: payloadMoliendaReapertura(parsed.data),
  });
  if (r.ok) revalidarReapertura(parsed.data.loteId);
  return r;
}
