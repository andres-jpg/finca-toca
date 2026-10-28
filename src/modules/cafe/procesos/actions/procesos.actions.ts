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
import type { ResultadoProceso } from "../types";

// Server Actions de la pantalla de planta (FIN-109). Cada una: módulo activo → rol de la membresía → Zod →
// escritura. Son endpoints POST públicos: la frontera real son las RPC `cafe.registrar_proceso` /
// `cafe.anular_proceso` (que repiten permisos, módulo y todas las reglas de orden y pesos) y el RLS; esto es
// defensa en profundidad. Devuelven `Result<T>` para que el formulario muestre el mensaje en vez de lanzar. La
// escritura es UNA RPC transaccional (proceso + bultos + baches): nunca inserts sueltos desde aquí.

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
 * Registra un proceso (trilla, tostión, molienda o empaque de maquila) con los bultos elegidos. La base valida
 * el orden, que el peso de entrada no pase el disponible, que los baches cuadren y fija la tarifa y la merma de
 * referencia del momento; la merma y el valor los calcula ella. Un desvío de merma NO bloquea: el proceso se
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
 * Anula un proceso con motivo (solo owner/admin). Se conserva auditado y libera sus bultos; la base lo rechaza si
 * un proceso posterior ya usa alguno de ellos (`proceso_con_dependientes`: se anula de atrás hacia delante).
 */
export async function anularProceso(input: AnularProcesoInput): Promise<Result<{ id: string; lote_id: string; lote_estado: string; bultos_liberados: number }>> {
  await requireModulo("cafe.procesos");
  await requireRolTenant(ROLES_ANULACION);

  const parsed = anularProcesoSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc<"cafe", "anular_proceso", { id: string; lote_id: string; lote_estado: string; bultos_liberados: number }>(
    "cafe",
    "anular_proceso",
    { p_proceso: parsed.data.procesoId, p_motivo: parsed.data.motivo },
  );
  if (r.ok) revalidarPlanta(r.data.lote_id);
  return r;
}

const consultaPesoSchema = z.object({
  loteId: z.uuid({ message: "El lote no es válido" }),
  tipo: z.enum(TIPOS_PROCESO, { message: "Elige el paso a registrar" }),
  bultoIds: z.array(z.uuid({ message: "Bulto no válido" })).min(1, "Elige al menos un bulto").max(200),
});

/**
 * Peso que puede entrar al paso con esos bultos (`cafe.peso_disponible`): el formulario lo precarga al cambiar
 * la selección. Es de solo lectura, pero se protege igual que las escrituras (endpoint POST público).
 */
export async function consultarPesoDisponible(
  loteId: string,
  tipo: (typeof TIPOS_PROCESO)[number],
  bultoIds: string[],
): Promise<Result<number | null>> {
  await requireModulo("cafe.procesos");
  await requireRolTenant(ROLES_REGISTRO);

  const parsed = consultaPesoSchema.safeParse({ loteId, tipo, bultoIds });
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  return getPesoDisponible(parsed.data.loteId, parsed.data.tipo, parsed.data.bultoIds);
}
