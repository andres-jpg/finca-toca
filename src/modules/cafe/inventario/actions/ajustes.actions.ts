"use server";

import { revalidatePath } from "next/cache";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import {
  ajusteInventarioSchema,
  cargaInicialSchema,
  payloadAjusteInventario,
  payloadCargaInicial,
  type AjusteInventarioFormInput,
  type CargaInicialFormInput,
} from "../schemas/ajuste.schema";

// Server Actions de «Ajustar inventario» y «Carga inicial» (B-15). Cada una: módulo activo → rol → Zod → RPC. Solo
// owner/admin: la frontera real son las RPC `cafe.ajustar_inventario` / `cafe.carga_inicial` (repiten rol y módulo) y
// el RLS de `cafe.inventario_ajustes`. Cada RPC es UNA transacción (registro de auditoría + movimiento del kardex).

const ROLES_AJUSTE: RolTenant[] = ["owner", "admin"];

export interface ResultadoAjuste {
  id: string;
  antes: number;
  despues: number;
  delta?: number;
}

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

function revalidarInventario() {
  revalidatePath("/dashboard/cafe/inventario");
  revalidatePath("/dashboard/cafe/configuracion/carga-inicial");
  revalidatePath("/dashboard/cafe/ventas/nueva");
  revalidatePath("/dashboard/cafe");
}

/** Ajusta el stock de un producto terminado (cantidad nueva o diferencia) con motivo obligatorio; nunca lo deja en negativo. */
export async function ajustarInventario(input: AjusteInventarioFormInput): Promise<Result<ResultadoAjuste>> {
  await requireModulo("cafe.inventario");
  await requireRolTenant(ROLES_AJUSTE);
  const parsed = ajusteInventarioSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc<"cafe", "ajustar_inventario", ResultadoAjuste>("cafe", "ajustar_inventario", { p: payloadAjusteInventario(parsed.data) });
  if (r.ok) revalidarInventario();
  return r;
}

/** Carga inicial de un producto terminado, del tostado sin empacar o del café verde: una vez por producto o tipo de café. */
export async function cargarInventarioInicial(input: CargaInicialFormInput): Promise<Result<ResultadoAjuste>> {
  await requireModulo("cafe.inventario");
  await requireRolTenant(ROLES_AJUSTE);
  const parsed = cargaInicialSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc<"cafe", "carga_inicial", ResultadoAjuste>("cafe", "carga_inicial", { p: payloadCargaInicial(parsed.data) });
  if (r.ok) revalidarInventario();
  return r;
}
