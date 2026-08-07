"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";
import type { ExtraccionLeche } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Precio vigente del litro de leche, o `null` si aún no hay ninguno registrado. */
async function precioLitroVigente(supabase: SupabaseClient): Promise<number | null> {
  const { data } = await supabase
    .from("precios")
    .select("valor")
    .eq("tipo", "leche")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.valor ?? null;
}

/** Litros del día por destino. Puede haber varias extracciones en la misma fecha. */
async function litrosDelDia(
  fecha: string,
  supabase: SupabaseClient
): Promise<{ cantina: number; cria: number }> {
  const { data } = await supabase
    .from("extracciones_leche")
    .select("litros_cantina, litros_cria")
    .eq("fecha", fecha);

  return (data ?? []).reduce(
    (acc, r) => ({
      cantina: acc.cantina + r.litros_cantina,
      cria: acc.cria + r.litros_cria,
    }),
    { cantina: 0, cria: 0 }
  );
}

/**
 * Ingreso automático por la leche de **cantina** (la que se vende).
 * Se recalcula entero en cada alta/edición/borrado de extracción de esa fecha, y se elimina
 * si el día se queda sin litros de cantina o si no hay precio registrado.
 */
async function upsertIngresoLeche(
  fecha: string,
  supabase: SupabaseClient
): Promise<void> {
  const precio = await precioLitroVigente(supabase);
  const { cantina } = await litrosDelDia(fecha, supabase);

  const { data: existing } = await supabase
    .from("ingresos")
    .select("id")
    .eq("fecha", fecha)
    .eq("source", "leche_extraccion")
    .maybeSingle();

  if (precio === null || cantina === 0) {
    if (existing?.id) {
      await supabase.from("ingresos").delete().eq("id", existing.id);
    }
    return;
  }

  const valor = Math.round(cantina * precio);

  if (existing?.id) {
    await supabase.from("ingresos").update({ valor }).eq("id", existing.id);
    return;
  }

  const { data: subconcepto } = await supabase
    .from("subconceptos_ingreso")
    .select("id")
    .ilike("nombre", "%leche%")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!subconcepto?.id) {
    console.error("upsertIngresoLeche: no se encontró subconcepto 'leche' en subconceptos_ingreso");
    return;
  }

  await supabase.from("ingresos").insert({
    fecha,
    subconcepto_id: subconcepto.id,
    valor,
    observaciones: "Auto-generado desde extracciones",
    source: "leche_extraccion",
  });
}

/** Subconcepto de gasto donde caen las leches de cría (creado por la migración, por tenant). */
const SUBCONCEPTO_LECHE_CRIA = "Leche para crías";

/**
 * Gasto automático por la leche de **cría** (la que se queda en la finca para los terneros),
 * valorada al mismo precio del litro que la que se vende. Espejo exacto de
 * `upsertIngresoLeche`: se recalcula entero por fecha y se borra si el día se queda sin
 * litros de cría o sin precio.
 *
 * Se marca `pagado: true` porque no es una factura pendiente de pagar a un tercero: es leche
 * propia que no se vendió, así que no debe aparecer como deuda en el listado de gastos.
 */
async function upsertGastoLecheCria(
  fecha: string,
  supabase: SupabaseClient
): Promise<void> {
  const precio = await precioLitroVigente(supabase);
  const { cria } = await litrosDelDia(fecha, supabase);

  const { data: existing } = await supabase
    .from("gastos")
    .select("id")
    .eq("fecha", fecha)
    .eq("source", "leche_cria")
    .maybeSingle();

  if (precio === null || cria === 0) {
    if (existing?.id) {
      await supabase.from("gastos").delete().eq("id", existing.id);
    }
    return;
  }

  const valor = Math.round(cria * precio);

  if (existing?.id) {
    await supabase.from("gastos").update({ valor }).eq("id", existing.id);
    return;
  }

  const { data: subconcepto } = await supabase
    .from("subconceptos_gasto")
    .select("id")
    .eq("nombre", SUBCONCEPTO_LECHE_CRIA)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!subconcepto?.id) {
    console.error(
      `upsertGastoLecheCria: no se encontró el subconcepto '${SUBCONCEPTO_LECHE_CRIA}' en subconceptos_gasto`
    );
    return;
  }

  await supabase.from("gastos").insert({
    fecha,
    subconcepto_id: subconcepto.id,
    valor,
    observaciones: "Auto-generado desde extracciones (leche para crías)",
    pagado: true,
    source: "leche_cria",
  });
}

/** Recalcula los dos apuntes automáticos (ingreso de cantina + gasto de cría) de una fecha. */
async function sincronizarApuntesLeche(
  fecha: string,
  supabase: SupabaseClient
): Promise<void> {
  await upsertIngresoLeche(fecha, supabase);
  await upsertGastoLecheCria(fecha, supabase);
}

export async function getExtracciones(): Promise<ExtraccionLeche[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("extracciones_leche")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudieron cargar las extracciones");
  return data;
}

/** Las tres rutas que muestran cifras derivadas de una extracción. */
function revalidarVistasLeche() {
  revalidatePath("/dashboard/extracciones");
  revalidatePath("/dashboard/ingresos");
  revalidatePath("/dashboard/gastos");
  revalidatePath("/dashboard");
}

export async function createExtraccion(formData: {
  fecha: string;
  litros_cantina: number;
  litros_cria: number;
}) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { data: vacasRows } = await supabase
    .from("animales")
    .select("id")
    .eq("sexo", "hembra")
    .eq("estado_productivo", "produccion")
    .eq("alta", true);

  const { error } = await supabase.from("extracciones_leche").insert({
    fecha: formData.fecha,
    litros_cantina: formData.litros_cantina,
    litros_cria: formData.litros_cria,
    vacas_en_produccion: vacasRows?.length ?? null,
  });

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe una extracción registrada para esta fecha");
    throw new Error("No se pudo registrar la extracción");
  }

  await sincronizarApuntesLeche(formData.fecha, supabase);

  revalidarVistasLeche();
}

export async function updateExtraccion(
  id: number,
  formData: { fecha: string; litros_cantina: number; litros_cria: number }
) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  // Fetch previous date before updating
  const { data: oldRow } = await supabase
    .from("extracciones_leche")
    .select("fecha")
    .eq("id", id)
    .single();

  const { data: vacasRows } = await supabase
    .from("animales")
    .select("id")
    .eq("sexo", "hembra")
    .eq("estado_productivo", "produccion")
    .eq("alta", true);

  const { error } = await supabase
    .from("extracciones_leche")
    .update({
      fecha: formData.fecha,
      litros_cantina: formData.litros_cantina,
      litros_cria: formData.litros_cria,
      vacas_en_produccion: vacasRows?.length ?? null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe una extracción registrada para esta fecha");
    throw new Error("No se pudo actualizar la extracción");
  }

  // Si cambió la fecha hay que recalcular también el día de origen, que puede haberse
  // quedado sin litros (y por tanto sin ingreso ni gasto automáticos).
  if (oldRow && oldRow.fecha !== formData.fecha) {
    await sincronizarApuntesLeche(oldRow.fecha, supabase);
  }
  await sincronizarApuntesLeche(formData.fecha, supabase);

  revalidarVistasLeche();
}

export async function deleteExtraccion(id: number) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  // Fetch date before deleting
  const { data: row } = await supabase
    .from("extracciones_leche")
    .select("fecha")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("extracciones_leche")
    .delete()
    .eq("id", id);

  if (error) throw new Error("No se pudo eliminar la extracción");

  if (row?.fecha) await sincronizarApuntesLeche(row.fecha, supabase);

  revalidarVistasLeche();
}

// === QUERIES ESPECÍFICAS PARA DASHBOARD ===

/**
 * Leche de hoy desglosada por destino, para la card del dashboard.
 * `total` es lo que mide la productividad de las vacas (se ordeñó igual, se venda o no).
 */
export async function getLecheHoy(): Promise<{
  cantina: number;
  cria: number;
  total: number;
}> {
  const supabase = await createClient();
  const hoy = formatDate(new Date());

  const { data, error } = await supabase
    .from("extracciones_leche")
    .select("litros_cantina, litros_cria")
    .eq("fecha", hoy);

  if (error) throw new Error("No se pudieron cargar los datos de extracción del día");

  const { cantina, cria } = (data ?? []).reduce(
    (acc, r) => ({
      cantina: acc.cantina + r.litros_cantina,
      cria: acc.cria + r.litros_cria,
    }),
    { cantina: 0, cria: 0 }
  );

  return { cantina, cria, total: cantina + cria };
}
