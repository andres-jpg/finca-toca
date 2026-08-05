"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";
import type { Pajilla, PajillaDisponible, PajillaPorToro } from "@/types";

const CAMPOS_PAJILLA =
  "id, created_at, toro_nombre, toro_ref_id, proveedor, fecha_compra, cantidad, cantidad_disponible, observaciones";

export async function getPajillas(): Promise<Pajilla[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pajillas")
    .select(CAMPOS_PAJILLA)
    .order("fecha_compra", { ascending: false });

  if (error) throw new Error("No se pudo cargar el inventario de pajillas");

  return (data ?? []).map((row: any) => ({
    id: row.id,
    created_at: row.created_at,
    toro_nombre: row.toro_nombre,
    toro_ref_id: row.toro_ref_id,
    proveedor: row.proveedor ?? null,
    fecha_compra: row.fecha_compra,
    cantidad: row.cantidad,
    cantidad_disponible: row.cantidad_disponible,
    observaciones: row.observaciones ?? null,
  }));
}

/**
 * Lotes de pajillas con su stock, para el selector de una inseminación.
 *
 * Devuelve un lote por fila **a propósito**: `toro_ref_id` es texto libre y está repetido
 * (en producción "NA" lo comparten cinco toros distintos y "TRO-001A" otros dos), así que
 * la versión anterior —que agrupaba por ese campo— fusionaba lotes de toros diferentes bajo
 * un único nombre y escondía el resto del inventario.
 *
 * No filtra por existencias: el formulario oculta los lotes agotados salvo el que ya tenga
 * seleccionado el evento que se está editando, que puede estar a 0 justo porque esa misma
 * inseminación gastó la última pajilla — filtrarlo aquí borraría la referencia al editar.
 *
 * Ordena por toro y, dentro de cada toro, por fecha de compra ascendente, para gastar antes
 * los lotes más antiguos.
 */
export async function getLotesPajillas(): Promise<PajillaDisponible[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pajillas")
    .select("id, toro_nombre, toro_ref_id, fecha_compra, cantidad_disponible")
    .order("toro_nombre")
    .order("fecha_compra");

  if (error) throw new Error("No se pudo cargar el inventario de pajillas");

  return (data ?? []) as unknown as PajillaDisponible[];
}

export async function getPajillasPorToro(): Promise<PajillaPorToro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pajillas")
    .select("toro_nombre, toro_ref_id, cantidad, cantidad_disponible");

  if (error) throw new Error("No se pudo cargar el inventario");

  // Se agrupa por nombre + referencia, no solo por `toro_ref_id`: ese campo es texto libre
  // y está repetido (varios toros comparten "NA"), así que agrupar solo por él sumaba en una
  // misma fila lotes de toros distintos y los mostraba bajo el nombre del primero.
  const grouped = new Map<string, PajillaPorToro>();
  for (const row of data ?? []) {
    const clave = `${row.toro_nombre}||${row.toro_ref_id}`;
    const existing = grouped.get(clave);
    if (existing) {
      existing.total_disponible += row.cantidad_disponible;
      existing.total_inicial += row.cantidad;
    } else {
      grouped.set(clave, {
        clave,
        toro_nombre: row.toro_nombre,
        toro_ref_id: row.toro_ref_id,
        total_disponible: row.cantidad_disponible,
        total_inicial: row.cantidad,
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.toro_nombre.localeCompare(b.toro_nombre)
  );
}

interface PajillaFormData {
  toro_nombre: string;
  toro_ref_id: string;
  proveedor?: string;
  fecha_compra: Date;
  cantidad: number;
  observaciones?: string;
}

export async function createPajillas(formData: PajillaFormData) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase.from("pajillas").insert({
    toro_nombre: formData.toro_nombre,
    toro_ref_id: formData.toro_ref_id,
    proveedor: formData.proveedor || null,
    fecha_compra: formatDate(formData.fecha_compra),
    cantidad: formData.cantidad,
    cantidad_disponible: formData.cantidad,
    observaciones: formData.observaciones || null,
  });

  if (error) throw new Error("No se pudo registrar el lote de pajillas");

  revalidatePath("/dashboard/inventario");
}

export async function updatePajilla(id: string, formData: PajillaFormData) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { data, error: fetchError } = await supabase
    .from("pajillas")
    .select("cantidad, cantidad_disponible")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw new Error("No se pudo cargar el lote a editar");
  if (!data) throw new Error("El lote ya no existe");

  const lote = data as unknown as { cantidad: number; cantidad_disponible: number };
  const usadas = lote.cantidad - lote.cantidad_disponible;

  // Al corregir la cantidad inicial se conserva lo ya gastado: lo que cambia es el
  // remanente. Bajar la inicial por debajo de las usadas dejaría un stock negativo.
  if (formData.cantidad < usadas) {
    throw new Error(
      `Este lote ya tiene ${usadas} pajilla(s) usadas: la cantidad inicial no puede ser menor`
    );
  }

  const { error } = await supabase
    .from("pajillas")
    .update({
      toro_nombre: formData.toro_nombre,
      toro_ref_id: formData.toro_ref_id,
      proveedor: formData.proveedor || null,
      fecha_compra: formatDate(formData.fecha_compra),
      cantidad: formData.cantidad,
      cantidad_disponible: formData.cantidad - usadas,
      observaciones: formData.observaciones || null,
    })
    .eq("id", id);

  if (error) throw new Error("No se pudo actualizar el lote de pajillas");

  revalidatePath("/dashboard/inventario");
}

/**
 * Suma `delta` al stock de un lote (negativo = consumir). Lo usan los eventos de
 * inseminación al crearse, editarse o borrarse.
 *
 * Relee el stock y comprueba el margen antes de escribir; si el lote ya no existe
 * (se borró el lote pero el evento sobrevivió con `pajilla_id` a NULL) no hace nada,
 * porque el evento reproductivo importa más que el ajuste de inventario.
 *
 * Lleva su propio `requireRole` aunque solo la llamen acciones ya protegidas: al exportarse
 * desde un fichero `"use server"` es un endpoint POST público por sí misma.
 */
export async function ajustarStockPajilla(pajillaId: string, delta: number) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { data, error: fetchError } = await supabase
    .from("pajillas")
    .select("toro_nombre, cantidad, cantidad_disponible")
    .eq("id", pajillaId)
    .maybeSingle();

  if (fetchError) throw new Error("Error al verificar el inventario de pajillas");
  if (!data) return;

  const lote = data as unknown as {
    toro_nombre: string;
    cantidad: number;
    cantidad_disponible: number;
  };
  const nuevo = lote.cantidad_disponible + delta;

  if (nuevo < 0) {
    throw new Error(`No quedan pajillas disponibles del lote de ${lote.toro_nombre}`);
  }
  // Devolver una pajilla nunca puede dejar el lote por encima de su cantidad inicial.
  const acotado = Math.min(nuevo, lote.cantidad);

  const { error } = await supabase
    .from("pajillas")
    .update({ cantidad_disponible: acotado })
    .eq("id", pajillaId);

  if (error) throw new Error("No se pudo actualizar el inventario de pajillas");

  revalidatePath("/dashboard/inventario");
}

export async function usarPajillas(id: string, cantidad: number) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { data, error: fetchError } = await supabase
    .from("pajillas")
    .select("cantidad_disponible")
    .eq("id", id)
    .single();

  if (fetchError) throw new Error("Error al verificar el stock disponible");
  if (data.cantidad_disponible < cantidad) {
    throw new Error(
      `Solo hay ${data.cantidad_disponible} pajilla(s) disponibles en este lote`
    );
  }

  const { error } = await supabase
    .from("pajillas")
    .update({ cantidad_disponible: data.cantidad_disponible - cantidad })
    .eq("id", id);

  if (error) throw new Error("No se pudo actualizar el inventario de pajillas");

  revalidatePath("/dashboard/inventario");
}

export async function deletePajilla(id: string) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase.from("pajillas").delete().eq("id", id);

  if (error) throw new Error("No se pudo eliminar el lote de pajillas");

  revalidatePath("/dashboard/inventario");
}
