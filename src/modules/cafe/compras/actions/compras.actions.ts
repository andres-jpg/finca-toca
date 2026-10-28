"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import { aPayloadCompra, compraSchema, type CompraFormInput, type CompraRegistrada } from "../schemas/compra.schema";

// Server Actions de la compra de café para marca propia. Cada una: módulo activo → rol de la membresía →
// Zod → RPC. Son endpoints POST públicos: la frontera real es el RLS y la propia RPC (`cafe.registrar_compra`
// comprueba rol y módulo por dentro); esto es defensa en profundidad. Devuelven `Result<T>` para que el
// formulario muestre el mensaje en vez de lanzar. La compra entera (lote MP-…, bultos, consecutivo) es UNA
// transacción en la base: aquí no se escribe nada por separado.

/** Recepción y compras: owner, admin y operativo (la gerencia, `viewer`, solo consulta). */
const ROLES_OPERACION: RolTenant[] = ["owner", "admin", "operativo"];

const RUTA_LOTES = "/dashboard/cafe/lotes";

async function autorizar(): Promise<void> {
  await requireModulo("cafe.recepcion");
  await requireRolTenant(ROLES_OPERACION);
}

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

/**
 * Registra la compra: crea el lote `MP-…` con sus bultos y el precio como snapshot. Devuelve el código y el
 * valor total que calculó la base (el operario nunca lo digita).
 */
export async function registrarCompra(input: CompraFormInput): Promise<Result<CompraRegistrada>> {
  await autorizar();
  const parsed = compraSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc<"cafe", "registrar_compra", CompraRegistrada>("cafe", "registrar_compra", {
    p: aPayloadCompra(parsed.data),
  });
  if (r.ok) revalidatePath(RUTA_LOTES);
  return r;
}

const sugerenciaSchema = z.object({ terceroId: z.uuid(), tipoCafeId: z.uuid() });

/**
 * Precio por kilo de la última compra no anulada de ese proveedor y ese tipo, o `null` si no hay (HU-01 c3).
 * Solo propone: el formulario siempre lo deja editar y cada lote guarda su propio precio.
 */
export async function obtenerPrecioSugerido(terceroId: string, tipoCafeId: string): Promise<Result<number | null>> {
  await autorizar();
  const parsed = sugerenciaSchema.safeParse({ terceroId, tipoCafeId });
  if (!parsed.success) return datosInvalidos("Elige el proveedor y el tipo de café.");

  const r = await callRpc<"cafe", "ultimo_precio_compra", number | null>("cafe", "ultimo_precio_compra", {
    p_tercero: parsed.data.terceroId,
    p_tipo: parsed.data.tipoCafeId,
  });
  if (!r.ok) return r;
  // numeric llega como número JSON; por si el cliente lo entregara como texto.
  const valor = r.data === null || r.data === undefined ? null : Number(r.data);
  return { ok: true, data: valor !== null && Number.isFinite(valor) ? valor : null };
}
