"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant } from "@/modules/core/auth/sesion";
import type { RespuestaMovimientos } from "@/modules/core/inventario/types";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "../../insumos/lib/insumos";
import { getKardexProducto } from "../queries/empaque.queries";
import { empaqueSchema, payloadEmpaque, payloadSalidaPt, salidaPtSchema, type EmpaqueFormInput, type SalidaPtFormInput } from "../schemas/empaque.schema";
import type { KardexProducto, ResultadoEmpaque } from "../types";

// Server Actions del empaque de marca propia y del inventario de producto terminado (FIN-111). Cada una: módulo
// activo → rol de la membresía → Zod → RPC. Son endpoints POST públicos: la frontera real son las RPC
// `cafe.registrar_empaque` / `cafe.registrar_salida_pt` (que repiten permisos, módulo y todas las reglas) y el
// RLS; esto es defensa en profundidad. Devuelven `Result<T>` para que el formulario muestre el mensaje en vez de
// lanzar. La escritura es UNA RPC transaccional (proceso + líneas + movimientos): nunca inserts sueltos desde aquí.

/** Empacar y registrar muestras/pérdidas: igual que las RPC y el RLS de los movimientos. Gerencia (`viewer`) solo consulta. */
const ROLES_OPERACION: RolTenant[] = ["owner", "admin", "operativo"];
/** Un ajuste es una corrección: solo owner/admin (la RPC y el RLS de `movimientos_inventario` lo repiten). */
const ROLES_AJUSTE: RolTenant[] = ["owner", "admin"];
/** El kardex lo ve todo miembro, Gerencia incluida. */
const ROLES_LECTURA: RolTenant[] = ["owner", "admin", "operativo", "viewer"];

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

function revalidarEmpaque(loteId: string | null) {
  revalidatePath("/dashboard/cafe/planta");
  revalidatePath("/dashboard/cafe/lotes");
  revalidatePath("/dashboard/cafe/inventario");
  revalidatePath("/dashboard/cafe/insumos");
  if (loteId) {
    revalidatePath(`/dashboard/cafe/planta/${loteId}`);
    revalidatePath(`/dashboard/cafe/lotes/${loteId}`);
  }
}

/**
 * Empaca un lote de marca propia por presentaciones: crea el proceso de empaque, sus líneas y mueve el inventario
 * (−bolsa, −etiqueta, +producto terminado) en UNA transacción. Faltar bolsas o etiquetas NO bloquea: se registra y
 * `advertencias` trae lo que quedó en negativo (decisión 14 de CO-20). Empacar más café del que hay sí falla
 * (`empaque_supera_peso`). Todo o nada.
 */
export async function registrarEmpaque(input: EmpaqueFormInput): Promise<Result<ResultadoEmpaque>> {
  await requireModulo("cafe.procesos");
  await requireModulo("cafe.inventario");
  const sesion = await requireRolTenant(ROLES_OPERACION);

  const parsed = empaqueSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  // La fecha es un día del calendario del cliente: no se empaca en el futuro. (La base solo la valida como fecha.)
  if (parsed.data.fecha > fechaHoyEnZona(sesion.tenant.zonaHoraria)) {
    return datosInvalidos("La fecha del empaque no puede ser futura.");
  }

  const r = await callRpc<"cafe", "registrar_empaque", ResultadoEmpaque>("cafe", "registrar_empaque", {
    p: payloadEmpaque(parsed.data),
  });
  if (r.ok) revalidarEmpaque(parsed.data.loteId);
  return r;
}

/**
 * Salida manual del producto terminado: muestra y pérdida (owner/admin/operativo) o ajuste (solo owner/admin, con
 * signo). La pérdida y el ajuste exigen observación. No deja el stock en negativo (`stock_insuficiente`). La venta
 * y la cortesía son de CO-31. El producto terminado NUNCA aumenta por aquí salvo con un ajuste: las entradas son
 * solo por empaque (HU-06 c3).
 */
export async function registrarSalidaPT(input: SalidaPtFormInput): Promise<Result<RespuestaMovimientos>> {
  await requireModulo("cafe.inventario");
  const parsed = salidaPtSchema.safeParse(input);
  // El rol se exige antes de leer el motivo "en serio": un operativo no ajusta aunque el formulario no se lo ofrezca.
  await requireRolTenant(parsed.success && parsed.data.motivo === "ajuste" ? ROLES_AJUSTE : ROLES_OPERACION);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const r = await callRpc<"cafe", "registrar_salida_pt", RespuestaMovimientos>("cafe", "registrar_salida_pt", {
    p: payloadSalidaPt(parsed.data),
  });
  if (r.ok) revalidarEmpaque(null);
  return r;
}

/** Kardex de un producto terminado (lo abre el modal de la matriz). Lo ven todos los roles, Gerencia incluida. */
export async function obtenerKardexProducto(articuloId: string): Promise<Result<KardexProducto>> {
  await requireModulo("cafe.inventario");
  await requireRolTenant(ROLES_LECTURA);

  // Solo productos terminados: esta acción no sirve para leer el kardex de cualquier artículo.
  const supabase = await createClient();
  const { data } = await supabase.from("v_stock").select("articulo_id").eq("articulo_id", articuloId).eq("tipo", "producto_terminado").maybeSingle();
  if (!data) return { ok: false, code: "articulo_no_encontrado", message: mensajeRpc("articulo_no_encontrado") };
  try {
    return { ok: true, data: await getKardexProducto(articuloId) };
  } catch {
    return { ok: false, code: "error_inesperado", message: "No se pudo cargar el kardex." };
  }
}
