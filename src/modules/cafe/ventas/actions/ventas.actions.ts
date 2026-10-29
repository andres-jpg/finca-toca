"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import { callRpc, traducirErrorRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "../../insumos/lib/insumos";
import {
  anularVentaSchema,
  completarFacturaSchema,
  payloadVenta,
  ventaSchema,
  type AnularVentaInput,
  type CompletarFacturaInput,
  type VentaFormInput,
} from "../schemas/venta.schema";
import type { ResultadoVenta } from "../types";

// Server Actions de las ventas y cortesías (FIN-112). Cada una: módulo activo → rol de la membresía → Zod → base. Son
// endpoints POST públicos: la frontera real son las RPC `cafe.registrar_venta` / `cafe.anular_venta`, el trigger de
// `cafe.ventas` y el RLS (repiten permisos, módulo y todas las reglas); esto es defensa en profundidad. Devuelven
// `Result<T>` para que el formulario muestre el mensaje en vez de lanzar. Vender es UNA RPC transaccional (número VT +
// venta + líneas + movimientos de inventario): nunca inserts sueltos desde aquí.

/** Vender y completar la factura: igual que la RPC y el RLS. Gerencia (`viewer`) solo consulta. */
const ROLES_OPERACION: RolTenant[] = ["owner", "admin", "operativo"];
/** Anular es una corrección: solo `owner`/`admin`. */
const ROLES_ANULAR: RolTenant[] = ["owner", "admin"];

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

function revalidarVentas(ventaId?: string) {
  revalidatePath("/dashboard/cafe/ventas");
  // La venta mueve el producto terminado y, al anular, lo repone.
  revalidatePath("/dashboard/cafe/inventario");
  if (ventaId) revalidatePath(`/dashboard/cafe/ventas/${ventaId}`);
}

/**
 * Registra una venta de café ya empacado (o una cortesía) con una o varias líneas. La base saca el número `VT`,
 * guarda el precio de cada línea (snapshot) y descuenta del producto terminado: si no alcanza el inventario AVISA y
 * no bloquea (`advertencias`; el stock queda negativo, en rojo). Todo o nada.
 */
export async function registrarVenta(input: VentaFormInput): Promise<Result<ResultadoVenta>> {
  await requireModulo("cafe.ventas");
  const sesion = await requireRolTenant(ROLES_OPERACION);

  const parsed = ventaSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  // La fecha es un día del calendario del cliente: no se vende en el futuro. (La base solo la valida como fecha.)
  if (parsed.data.fecha > fechaHoyEnZona(sesion.tenant.zonaHoraria)) {
    return datosInvalidos("La fecha no puede ser futura.");
  }

  const r = await callRpc<"cafe", "registrar_venta", ResultadoVenta>("cafe", "registrar_venta", { p: payloadVenta(parsed.data) });
  if (r.ok) revalidarVentas(r.data.id);
  return r;
}

/**
 * Anula una venta o cortesía (solo `owner`/`admin`, con motivo): repone el stock con movimientos de devolución. El
 * número no se reutiliza. La venta anulada queda en el historial y ya no se modifica.
 */
export async function anularVenta(input: AnularVentaInput): Promise<Result<{ id: string; numero: string }>> {
  await requireModulo("cafe.ventas");
  await requireRolTenant(ROLES_ANULAR);

  const parsed = anularVentaSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc<"cafe", "anular_venta", { id: string; numero: string }>("cafe", "anular_venta", {
    p_venta: parsed.data.ventaId,
    p_motivo: parsed.data.motivo,
  });
  if (r.ok) revalidarVentas(parsed.data.ventaId);
  return r;
}

/**
 * Completa el número de la factura emitida en Aliados de una venta que la requería (estaba «pendiente»). Es lo único
 * que se edita de una venta ya guardada: la base solo concede ese UPDATE (privilegio por columna) y rechaza una venta
 * anulada o que no requería factura. Esta app no emite facturas.
 */
export async function completarFacturaVenta(input: CompletarFacturaInput): Promise<Result<{ id: string }>> {
  await requireModulo("cafe.ventas");
  await requireRolTenant(ROLES_OPERACION);

  const parsed = completarFacturaSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("ventas")
    .update({ numero_factura_aliados: parsed.data.numeroFactura })
    .eq("id", parsed.data.ventaId)
    .select("id");
  if (error) return traducirErrorRpc("cafe", "ventas", error);
  if (!data || data.length === 0) {
    return { ok: false, code: "venta_no_encontrada", message: mensajeRpc("venta_no_encontrada") };
  }
  revalidarVentas(parsed.data.ventaId);
  return { ok: true, data: { id: parsed.data.ventaId } };
}
