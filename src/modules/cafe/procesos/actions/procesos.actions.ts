"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "../../insumos/lib/insumos";
import { getPesoDisponible } from "../queries/planta.queries";
import {
  anularProcesoSchema,
  payloadProceso,
  procesoSchema,
  TIPOS_PROCESO,
  type AnularProcesoInput,
  type ProcesoFormInput,
} from "../schemas/proceso.schema";
import { confirmarMoliendaSchema, payloadConfirmarMolienda, type ConfirmarMoliendaInput } from "../schemas/molienda.schema";
import type { ResultadoProceso } from "../types";

// Server Actions de la pantalla de planta (FIN-109). Cada una: módulo activo → rol de la membresía → Zod →
// escritura. Son endpoints POST públicos: la frontera real son las RPC `cafe.registrar_proceso` /
// `cafe.anular_proceso` (que repiten permisos, módulo y todas las reglas de orden y pesos) y el RLS; esto es
// defensa en profundidad. Devuelven `Result<T>` para que el formulario muestre el mensaje en vez de lanzar. La
// escritura es UNA RPC transaccional (proceso + baches): nunca inserts sueltos desde aquí.

/** Registrar un proceso: igual que la RPC y el RLS de `cafe.procesos` (INSERT). Gerencia (`viewer`) solo consulta. */
const ROLES_REGISTRO: RolTenant[] = ["owner", "admin", "operativo"];
/** Anular es una corrección: solo `owner`/`admin` (la RPC lo repite). */
const ROLES_ANULACION: RolTenant[] = ["owner", "admin"];

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

function revalidarPlanta(loteId: string) {
  revalidatePath("/dashboard/cafe/planta");
  revalidatePath(`/dashboard/cafe/planta/${loteId}`);
  revalidatePath("/dashboard/cafe/lotes");
  revalidatePath(`/dashboard/cafe/lotes/${loteId}`);
}

/**
 * Registra un proceso (trilla, tostión, molienda o empaque de maquila) sobre la tanda elegida (`origen_proceso_id`). La
 * base valida el orden, que los kilos no pasen el saldo del origen, que los baches cuadren y fija la tarifa y la merma de
 * referencia del momento; la merma y el valor los calcula ella (la de la tostión, al empacar). Un desvío de merma NO bloquea: el proceso se
 * guarda marcado y `desvio` viene en la respuesta. Todo o nada.
 */
export async function registrarProceso(input: ProcesoFormInput): Promise<Result<ResultadoProceso>> {
  await requireModulo("cafe.procesos");
  const sesion = await requireRolTenant(ROLES_REGISTRO);

  const parsed = procesoSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  // La fecha es un día del calendario del cliente: no se registra un proceso del futuro. (La base solo la
  // valida como fecha: el navegador puede estar en otra zona y el servidor está en UTC.)
  if (parsed.data.fecha > fechaHoyEnZona(sesion.tenant.zonaHoraria)) {
    return datosInvalidos("La fecha del proceso no puede ser futura.");
  }

  const r = await callRpc<"cafe", "registrar_proceso", ResultadoProceso>("cafe", "registrar_proceso", {
    p: payloadProceso(parsed.data),
  });
  if (r.ok) revalidarPlanta(parsed.data.loteId);
  return r;
}

/**
 * Anula un proceso con motivo (solo owner/admin). Se conserva auditado y libera sus kilos (el saldo es derivado); la base lo
 * rechaza si un proceso posterior parte de él (`proceso_con_dependientes`: se anula de atrás hacia delante).
 */
export async function anularProceso(input: AnularProcesoInput): Promise<Result<{ id: string; lote_id: string; lote_estado: string; kg_liberados: number }>> {
  await requireModulo("cafe.procesos");
  await requireRolTenant(ROLES_ANULACION);

  const parsed = anularProcesoSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc<"cafe", "anular_proceso", { id: string; lote_id: string; lote_estado: string; kg_liberados: number }>(
    "cafe",
    "anular_proceso",
    { p_proceso: parsed.data.procesoId, p_motivo: parsed.data.motivo },
  );
  if (r.ok) revalidarPlanta(r.data.lote_id);
  return r;
}

/**
 * Confirma la molienda de una tanda (B-07): sin pesos ni merma. Con `modo` cambia antes la cantidad a moler («Modificar
 * cantidad»). La base valida que la tanda no se haya molido ni empacado y fija la tarifa del día; los kilos son estimados.
 */
export async function confirmarMolienda(input: ConfirmarMoliendaInput): Promise<Result<ResultadoProceso & { tostion_proceso_id: string }>> {
  await requireModulo("cafe.procesos");
  const sesion = await requireRolTenant(ROLES_REGISTRO);

  const parsed = confirmarMoliendaSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  if (parsed.data.fecha > fechaHoyEnZona(sesion.tenant.zonaHoraria)) {
    return datosInvalidos("La fecha de la molienda no puede ser futura.");
  }

  const r = await callRpc<"cafe", "confirmar_molienda", ResultadoProceso & { tostion_proceso_id: string }>("cafe", "confirmar_molienda", {
    p: payloadConfirmarMolienda(parsed.data),
  });
  if (r.ok) revalidarPlanta(parsed.data.loteId);
  return r;
}

const consultaPesoSchema = z.object({
  loteId: z.uuid({ message: "El lote no es válido" }),
  tipo: z.enum(TIPOS_PROCESO, { message: "Elige el paso a registrar" }),
});

/**
 * Kilos que puede procesar el paso ahora (`cafe.peso_disponible`): Σ saldo de sus orígenes. Es de solo lectura, pero se
 * protege igual que las escrituras (endpoint POST público).
 */
export async function consultarPesoDisponible(loteId: string, tipo: (typeof TIPOS_PROCESO)[number]): Promise<Result<number | null>> {
  await requireModulo("cafe.procesos");
  await requireRolTenant(ROLES_REGISTRO);

  const parsed = consultaPesoSchema.safeParse({ loteId, tipo });
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  return getPesoDisponible(parsed.data.loteId, parsed.data.tipo);
}
