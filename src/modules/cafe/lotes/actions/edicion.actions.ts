"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import type { MetricasEdicion } from "../edicion/edicion";

// A-18 (FIN-136) · Server Actions de «Editar lote». Endpoints POST públicos: módulo → rol (solo owner/admin) → Zod →
// UNA RPC (`cafe.editar_lote`, que repite rol, módulo y las reglas de bloqueo). Esconder el botón es cosmético; la frontera
// real es la RPC + el RLS + los triggers que impiden tocar estos datos por otra vía.

const ROLES_EDICION: RolTenant[] = ["owner", "admin"];

const schema = z.object({
  loteId: z.uuid({ message: "El lote no es válido." }),
  motivo: z.string().trim().min(3, "Escribe el motivo de la corrección.").max(500, "El motivo es demasiado largo (máximo 500 caracteres)."),
  lote: z.record(z.string(), z.unknown()).optional(),
  procesos: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
});

export type EntradaEdicion = z.input<typeof schema>;

export interface CambioEdicion {
  entidad: "lote" | "proceso" | "bache";
  entidad_id: string;
  referencia: string | null;
  campo: string;
  antes: string | null;
  despues: string | null;
}

export interface ResultadoEdicion {
  simulado: boolean;
  edicion_id: string | null;
  lote_id: string;
  cambios: CambioEdicion[];
  antes: MetricasEdicion;
  despues: MetricasEdicion;
}

async function ejecutar(input: EntradaEdicion, simular: boolean): Promise<Result<ResultadoEdicion>> {
  await requireModulo("cafe.recepcion");
  await requireRolTenant(ROLES_EDICION);

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "datos_invalidos", message: parsed.error.issues[0]?.message ?? mensajeRpc("datos_invalidos") };
  }
  const { loteId, motivo, lote, procesos } = parsed.data;
  const r = await callRpc<"cafe", "editar_lote", ResultadoEdicion>("cafe", "editar_lote", {
    p_input: { lote_id: loteId, motivo, simular, ...(lote ? { lote } : {}), ...(procesos ? { procesos } : {}) } as never,
  });
  if (r.ok && !simular) {
    revalidatePath("/dashboard/cafe/lotes");
    revalidatePath(`/dashboard/cafe/lotes/${loteId}`);
    revalidatePath("/dashboard/cafe/planta");
    revalidatePath("/dashboard/cafe");
  }
  return r;
}

/** «Ver impacto»: aplica la corrección dentro de la base y la revierte, devolviendo lo que cambiaría. No escribe nada. */
export async function previsualizarEdicion(input: EntradaEdicion): Promise<Result<ResultadoEdicion>> {
  return ejecutar(input, true);
}

/** Guarda la corrección con su motivo y deja la traza en el historial del lote. */
export async function guardarEdicion(input: EntradaEdicion): Promise<Result<ResultadoEdicion>> {
  return ejecutar(input, false);
}
