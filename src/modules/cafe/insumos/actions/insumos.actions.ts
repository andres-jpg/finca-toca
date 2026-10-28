"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRolTenant } from "@/modules/core/auth/guards";
import type { RolTenant, Sesion } from "@/modules/core/auth/sesion";
import { actualizarArticulo, crearArticulo } from "@/modules/core/inventario/actions/inventario.actions";
import { createClienteInventario } from "@/modules/core/inventario/lib/cliente";
import type { Articulo, RespuestaMovimientos } from "@/modules/core/inventario/types";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { mensajeRpc } from "@/modules/core/rpc/mensajes";
import { requireModulo } from "@/modules/core/tenants/tenant.guards";
import type { Json } from "@/lib/supabase/database.types";
import { atributosInsumo, fechaHoyEnZona, instanteMediodia, leerAtributosInsumo } from "../lib/insumos";
import { getKardexInsumo } from "../queries/insumos.queries";
import {
  ajusteInsumoSchema,
  compraInsumoSchema,
  editarInsumoSchema,
  insumoSchema,
  type AjusteInsumoFormInput,
  type CompraInsumoFormInput,
  type EditarInsumoFormInput,
  type InsumoFormInput,
} from "../schemas/insumo.schema";
import { REF_TERCERO, type KardexInsumo } from "../types";

// Server Actions de los insumos de empaque. Cada una: módulo activo → rol de la membresía → Zod → escritura.
// Son endpoints POST públicos: la frontera real es el RLS (`articulos` y `movimientos_inventario`, que además
// deja los ajustes solo a owner/admin); esto es defensa en profundidad. Devuelven `Result<T>` para que el
// formulario muestre el mensaje en vez de lanzar. Los movimientos (compras y ajustes) pasan SIEMPRE por la RPC
// `registrar_movimientos`: nunca `.insert()` directo. El stock no se guarda en ningún sitio: es la suma de
// movimientos. `tenant_id` lo estampa el DEFAULT `tenant_actual()`.
//
// Un insumo nuevo de clase «bolsa» genera solo sus productos terminados (trigger de `cafe_tipos.sql`): no se
// crean desde aquí.

/** Maestro y correcciones: owner/admin (igual que el RLS de `articulos` y de los ajustes). */
const ROLES_MAESTRO: RolTenant[] = ["owner", "admin"];
/** Compras: también el operativo (bodega). */
const ROLES_OPERACION: RolTenant[] = ["owner", "admin", "operativo"];
/** Consultar el kardex: todos, Gerencia incluida. */
const ROLES_LECTURA: RolTenant[] = ["owner", "admin", "operativo", "viewer"];

const RUTA = "/dashboard/cafe/insumos";

async function autorizar(roles: RolTenant[]): Promise<Sesion> {
  await requireModulo("cafe.inventario");
  return requireRolTenant(roles);
}

function datosInvalidos(mensaje: string | undefined): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje ?? mensajeRpc("datos_invalidos") };
}

function noEncontrado(): Result<never> {
  return { ok: false, code: "articulo_no_encontrado", message: mensajeRpc("articulo_no_encontrado") };
}

/**
 * El insumo de empaque con ese id en el cliente actual (RLS), o `null`. Cada acción lo comprueba antes de
 * escribir: así estas acciones no sirven para tocar un producto terminado ni un artículo de otro tipo.
 */
async function cargarInsumo(id: string): Promise<{ id: string; nombre: string; activo: boolean } | null> {
  const supabase = await createClienteInventario();
  const { data } = await supabase.from("v_stock").select("articulo_id, nombre, activo, atributos").eq("articulo_id", id).eq("tipo", "insumo").maybeSingle();
  if (!data || !leerAtributosInsumo(data.atributos)) return null;
  return { id: data.articulo_id, nombre: data.nombre, activo: data.activo };
}

// --- Maestro --------------------------------------------------------------------------------------------

export async function crearInsumo(input: InsumoFormInput): Promise<Result<Articulo>> {
  await autorizar(ROLES_MAESTRO);
  const parsed = insumoSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  const { nombre, clase, presentacion_g, stock_minimo } = parsed.data;

  const r = await crearArticulo({
    nombre,
    tipo: "insumo",
    unidad: "unidad",
    atributos: atributosInsumo(clase, presentacion_g),
    stock_minimo,
  });
  if (!r.ok) {
    // El único índice único de `articulos` que puede saltar aquí es el de (tipo, atributos).
    if (r.code === "duplicado") {
      return { ok: false, code: "duplicado", message: "Ya existe un insumo de esa clase y esa presentación." };
    }
    return r;
  }
  revalidatePath(RUTA);
  return r;
}

/** Cambia nombre y mínimo. Clase y presentación no se editan: definen los productos terminados. */
export async function actualizarInsumo(id: string, input: EditarInsumoFormInput): Promise<Result<Articulo>> {
  await autorizar(ROLES_MAESTRO);
  const parsed = editarInsumoSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  if (!(await cargarInsumo(id))) return noEncontrado();

  const r = await actualizarArticulo(id, parsed.data);
  if (r.ok) revalidatePath(RUTA);
  return r;
}

async function cambiarActivo(id: string, activo: boolean): Promise<Result<Articulo>> {
  await autorizar(ROLES_MAESTRO);
  if (!(await cargarInsumo(id))) return noEncontrado();
  const r = await actualizarArticulo(id, { activo });
  if (r.ok) revalidatePath(RUTA);
  return r;
}

/** Un insumo no se borra (no existe DELETE): se desactiva. Conserva su historial y deja de admitir movimientos. */
export async function desactivarInsumo(id: string): Promise<Result<Articulo>> {
  return cambiarActivo(id, false);
}

/** Reactivar una bolsa vuelve a generar los productos terminados que falten (lo hace un trigger). */
export async function reactivarInsumo(id: string): Promise<Result<Articulo>> {
  return cambiarActivo(id, true);
}

// --- Movimientos ----------------------------------------------------------------------------------------

/** Una compra suma al stock (`motivo = 'compra'`); el proveedor queda en `ref_tipo/ref_id` y se ve en el kardex. */
export async function registrarCompraInsumo(input: CompraInsumoFormInput): Promise<Result<RespuestaMovimientos>> {
  const sesion = await autorizar(ROLES_OPERACION);
  const parsed = compraInsumoSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  const { articuloId, cantidad, costoUnitario, terceroId, fecha, observaciones } = parsed.data;

  if (!(await cargarInsumo(articuloId))) return noEncontrado();

  // La fecha es un día del calendario del cliente: hoy se registra con la hora actual; un día pasado, a
  // mediodía de su zona (para que ningún cambio de zona lo mueva de día); uno futuro no tiene sentido.
  const zona = sesion.tenant.zonaHoraria;
  const hoy = fechaHoyEnZona(zona);
  if (fecha > hoy) return datosInvalidos("La fecha de la compra no puede ser futura.");
  const instante = fecha === hoy ? null : instanteMediodia(fecha, zona);
  if (fecha !== hoy && !instante) return datosInvalidos("La fecha no es válida.");

  if (terceroId) {
    const supabase = await createClient();
    const { data } = await supabase.from("terceros").select("roles").eq("id", terceroId).maybeSingle();
    if (!data?.roles.includes("proveedor")) return datosInvalidos("El proveedor no existe o no está registrado como proveedor.");
  }

  const movimiento: Record<string, Json> = {
    articulo_id: articuloId,
    cantidad,
    motivo: "compra",
    ...(instante ? { fecha: instante } : {}),
    ...(costoUnitario !== null ? { costo_unitario: costoUnitario } : {}),
    ...(terceroId ? { ref_tipo: REF_TERCERO, ref_id: terceroId } : {}),
    ...(observaciones ? { observaciones } : {}),
  };
  const r = await callRpc<"public", "registrar_movimientos", RespuestaMovimientos>("public", "registrar_movimientos", {
    p_movs: [movimiento],
    p_permitir_negativo: false,
  });
  if (r.ok) revalidatePath(RUTA);
  return r;
}

/**
 * Corrige el stock con un movimiento `ajuste` (la cantidad lleva signo, la observación es obligatoria). Es
 * una corrección: solo owner/admin, también a nivel de RLS. Un ajuste que dejaría el stock en negativo falla.
 */
export async function ajustarInsumo(input: AjusteInsumoFormInput): Promise<Result<RespuestaMovimientos>> {
  await autorizar(ROLES_MAESTRO);
  const parsed = ajusteInsumoSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message);
  const { articuloId, cantidad, observaciones } = parsed.data;

  if (!(await cargarInsumo(articuloId))) return noEncontrado();

  const r = await callRpc<"public", "registrar_movimientos", RespuestaMovimientos>("public", "registrar_movimientos", {
    p_movs: [{ articulo_id: articuloId, cantidad, motivo: "ajuste", observaciones }],
    p_permitir_negativo: false,
  });
  if (r.ok) revalidatePath(RUTA);
  return r;
}

// --- Lectura --------------------------------------------------------------------------------------------

/** Kardex de un insumo (lo abre el modal de la tabla). Lo ven todos los roles, Gerencia incluida. */
export async function obtenerKardexInsumo(articuloId: string): Promise<Result<KardexInsumo>> {
  await autorizar(ROLES_LECTURA);
  if (!(await cargarInsumo(articuloId))) return noEncontrado();
  try {
    return { ok: true, data: await getKardexInsumo(articuloId) };
  } catch {
    return { ok: false, code: "error_inesperado", message: "No se pudo cargar el kardex." };
  }
}
