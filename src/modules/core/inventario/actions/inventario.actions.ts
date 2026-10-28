"use server";

import { callRpc, traducirErrorRpc, type Result } from "../../rpc/call-rpc";
import { mensajeRpc } from "../../rpc/mensajes";
import { createClienteInventario } from "../lib/cliente";
import { ROLES_CATALOGO, ROLES_MOVIMIENTOS, exigirRolTenant } from "../lib/autorizar";
import {
  actualizarArticuloSchema,
  crearArticuloSchema,
  registrarMovimientosSchema,
  type ActualizarArticuloInput,
  type CrearArticuloInput,
  type RegistrarMovimientosInput,
} from "../schemas/inventario.schemas";
import type { Articulo, RespuestaMovimientos } from "../types";

// Server Actions del inventario. Cada una: autoriza (rol de membresía) → valida con Zod → escribe.
// Devuelven `Result<T>` (como `callRpc`) en vez de lanzar, para que el formulario muestre el mensaje.
// Los movimientos se escriben SIEMPRE por la RPC `registrar_movimientos`: nunca `.insert()` directo,
// porque la RPC es la que bloquea por artículo, comprueba el stock y hace atómica la operación.
// Sin `revalidatePath`: el núcleo no tiene páginas propias; las del vertical revalidan al llamar.

const CAMPOS_ARTICULO =
  "id, tenant_id, codigo, nombre, tipo, unidad, atributos, stock_minimo, activo, created_at, created_by, updated_at, updated_by";

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

// --- Artículos --------------------------------------------------------------------------------------

export async function crearArticulo(input: CrearArticuloInput): Promise<Result<Articulo>> {
  await exigirRolTenant(ROLES_CATALOGO);
  const parsed = crearArticuloSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const supabase = await createClienteInventario();
  // `tenant_id` lo estampa el DEFAULT `tenant_actual()`: no se pasa desde aquí.
  const { data, error } = await supabase.from("articulos").insert(parsed.data).select(CAMPOS_ARTICULO).single();
  if (error) return traducirErrorRpc("public", "articulos", error);
  return { ok: true, data };
}

/** Cambia codigo, nombre, atributos, stock mínimo o `activo`. `tipo` y `unidad` no se editan. */
export async function actualizarArticulo(id: string, input: ActualizarArticuloInput): Promise<Result<Articulo>> {
  await exigirRolTenant(ROLES_CATALOGO);
  const parsed = actualizarArticuloSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const supabase = await createClienteInventario();
  const { data, error } = await supabase
    .from("articulos")
    .update(parsed.data)
    .eq("id", id)
    .select(CAMPOS_ARTICULO)
    .maybeSingle();
  if (error) return traducirErrorRpc("public", "articulos", error);
  // El RLS filtra los artículos de otro cliente: aquí se ven igual que uno inexistente.
  if (!data) return { ok: false, code: "articulo_no_encontrado", message: mensajeRpc("articulo_no_encontrado") };
  return { ok: true, data };
}

/** Un artículo con movimientos no se borra: se desactiva (y deja de admitir movimientos). */
export async function desactivarArticulo(id: string): Promise<Result<Articulo>> {
  return actualizarArticulo(id, { activo: false });
}

export async function reactivarArticulo(id: string): Promise<Result<Articulo>> {
  return actualizarArticulo(id, { activo: true });
}

// --- Movimientos ------------------------------------------------------------------------------------

/**
 * Registra uno o varios movimientos en una sola transacción (empacar = −bolsa −etiqueta +producto
 * terminado). Con `permitirNegativo` una salida sin stock se registra y vuelve en `advertencias`
 * (caso venta); sin él falla con `stock_insuficiente` y no queda nada escrito.
 */
export async function registrarMovimientos(input: RegistrarMovimientosInput): Promise<Result<RespuestaMovimientos>> {
  await exigirRolTenant(ROLES_MOVIMIENTOS);
  const parsed = registrarMovimientosSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);

  const { movimientos, permitirNegativo } = parsed.data;
  return callRpc<"public", "registrar_movimientos", RespuestaMovimientos>("public", "registrar_movimientos", {
    p_movs: movimientos.map((m) => ({ ...m, fecha: m.fecha?.toISOString() })),
    p_permitir_negativo: permitirNegativo,
  });
}
