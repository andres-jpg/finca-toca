"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";
import type { Vaca, VacaDetalle, VacaEstado, VacaOrigen, CriaAnimal } from "@/types";

async function consumirPajillaParaPadre(
  supabase: Awaited<ReturnType<typeof createClient>>,
  toroRefId: string
): Promise<string> {
  const { data: lotes, error } = await supabase
    .from("pajillas")
    .select("id, toro_nombre, cantidad_disponible")
    .eq("toro_ref_id", toroRefId)
    .gt("cantidad_disponible", 0)
    .order("fecha_compra", { ascending: true })
    .limit(1);

  if (error) throw new Error("Error al verificar las pajillas disponibles");
  if (!lotes || lotes.length === 0)
    throw new Error("No hay pajillas disponibles para este toro");

  const lote = lotes[0];
  const { error: updateError } = await supabase
    .from("pajillas")
    .update({ cantidad_disponible: lote.cantidad_disponible - 1 })
    .eq("id", lote.id);

  if (updateError) throw new Error("No se pudo actualizar el inventario de pajillas");

  revalidatePath("/dashboard/inventario");
  return lote.toro_nombre as string;
}

const SELECT_FIELDS =
  "id, created_at, vaca_id, nombre, origen, estado, fecha_compra, fecha_nacimiento, numero_registro, madre_id, padre_id, padre_pajilla_nombre, alta, madre:madre_id(nombre), padre:padre_id(nombre)";

function mapRow(row: any): Vaca {
  const madreRaw = Array.isArray(row.madre) ? row.madre[0] : row.madre;
  const padreRaw = Array.isArray(row.padre) ? row.padre[0] : row.padre;
  return {
    id: row.id,
    created_at: row.created_at,
    vaca_id: row.vaca_id,
    nombre: row.nombre,
    origen: row.origen,
    estado: row.estado,
    fecha_compra: row.fecha_compra,
    fecha_nacimiento: row.fecha_nacimiento,
    numero_registro: row.numero_registro,
    madre_id: row.madre_id,
    madre_nombre: madreRaw?.nombre ?? null,
    padre_id: row.padre_id,
    padre_nombre: padreRaw?.nombre ?? null,
    padre_pajilla_nombre: row.padre_pajilla_nombre ?? null,
    alta: row.alta,
  };
}

export async function getVacas(): Promise<Vaca[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vacas")
    .select(SELECT_FIELDS);

  if (error) throw new Error("No se pudieron cargar las vacas");
  return (data ?? []).map(mapRow).sort((a, b) =>
    a.vaca_id.localeCompare(b.vaca_id, undefined, { numeric: true })
  );
}

export async function getVacasDeAlta(): Promise<Vaca[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vacas")
    .select(SELECT_FIELDS)
    .eq("alta", true);

  if (error) throw new Error("No se pudieron cargar las vacas");
  return (data ?? []).map(mapRow).sort((a, b) =>
    a.vaca_id.localeCompare(b.vaca_id, undefined, { numeric: true })
  );
}

export async function getVacaById(id: string): Promise<VacaDetalle | null> {
  const supabase = await createClient();

  const { data: vaca, error } = await supabase
    .from("vacas")
    .select("*, madre:madre_id(id, vaca_id, nombre), padre:padre_id(id, toro_id, nombre)")
    .eq("id", id)
    .single();

  if (error || !vaca) return null;

  const [{ data: criasVacas }, { data: criasToros }] = await Promise.all([
    supabase
      .from("vacas")
      .select("id, vaca_id, nombre, estado, alta")
      .eq("madre_id", id),
    supabase
      .from("toros")
      .select("id, toro_id, nombre, estado, alta")
      .eq("madre_id", id)
      .order("toro_id", { ascending: true }),
  ]);

  const madreRaw = Array.isArray(vaca.madre) ? vaca.madre[0] : vaca.madre;
  const padreRaw = Array.isArray(vaca.padre) ? vaca.padre[0] : vaca.padre;

  const criasVacasMapped = (criasVacas ?? [])
    .sort((a: any, b: any) =>
      String(a.vaca_id).localeCompare(String(b.vaca_id), undefined, { numeric: true })
    )
    .map((c: any) => ({
      id: c.id,
      tipo: "vaca" as const,
      animal_id: c.vaca_id,
      nombre: c.nombre,
      estado: c.estado,
      alta: c.alta,
    }));

  const crias: CriaAnimal[] = [
    ...criasVacasMapped,
    ...(criasToros ?? []).map((c: any) => ({
      id: c.id,
      tipo: "toro" as const,
      animal_id: c.toro_id,
      nombre: c.nombre,
      estado: c.estado,
      alta: c.alta,
    })),
  ];

  return {
    ...mapRow({ ...vaca, madre: vaca.madre, padre: vaca.padre }),
    padre: padreRaw ? { id: padreRaw.id, toro_id: padreRaw.toro_id, nombre: padreRaw.nombre } : null,
    madre: madreRaw ? { id: madreRaw.id, vaca_id: madreRaw.vaca_id, nombre: madreRaw.nombre } : null,
    crias,
  };
}

export async function createVaca(formData: {
  vaca_id: string;
  nombre: string;
  origen: VacaOrigen;
  estado: VacaEstado;
  fecha_compra?: Date | null;
  fecha_nacimiento?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
  padre_id?: string | null;
  padre_pajilla_toro_ref_id?: string | null;
}) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  let padrePajillaNombre: string | null = null;
  let padreId: string | null = formData.padre_id || null;

  if (formData.padre_pajilla_toro_ref_id) {
    padrePajillaNombre = await consumirPajillaParaPadre(supabase, formData.padre_pajilla_toro_ref_id);
    padreId = null;
  }

  const { error } = await supabase.from("vacas").insert({
    vaca_id: formData.vaca_id,
    nombre: formData.nombre,
    origen: formData.origen,
    estado: formData.estado,
    fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
    fecha_nacimiento: formData.fecha_nacimiento ? formatDate(formData.fecha_nacimiento) : null,
    numero_registro: formData.numero_registro || null,
    madre_id: formData.madre_id || null,
    padre_id: padreId,
    padre_pajilla_nombre: padrePajillaNombre,
  });

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe una vaca con ese número de identificación");
    throw new Error("No se pudo registrar la vaca");
  }
  revalidatePath("/dashboard/vacas");
}

export async function updateVaca(
  id: string,
  formData: {
    vaca_id: string;
    nombre: string;
    origen: VacaOrigen;
    estado: VacaEstado;
    fecha_compra?: Date | null;
    fecha_nacimiento?: Date | null;
    numero_registro?: string;
    madre_id?: string | null;
    padre_id?: string | null;
    padre_pajilla_toro_ref_id?: string | null;
    padre_pajilla_nombre_keep?: string | null;
  }
) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  let padrePajillaNombre: string | null = null;
  let padreId: string | null = formData.padre_id || null;

  if (formData.padre_pajilla_toro_ref_id) {
    padrePajillaNombre = await consumirPajillaParaPadre(supabase, formData.padre_pajilla_toro_ref_id);
    padreId = null;
  } else if (formData.padre_pajilla_nombre_keep) {
    padrePajillaNombre = formData.padre_pajilla_nombre_keep;
    padreId = null;
  }

  const { error } = await supabase
    .from("vacas")
    .update({
      vaca_id: formData.vaca_id,
      nombre: formData.nombre,
      origen: formData.origen,
      estado: formData.estado,
      fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
      fecha_nacimiento: formData.fecha_nacimiento ? formatDate(formData.fecha_nacimiento) : null,
      numero_registro: formData.numero_registro || null,
      madre_id: formData.madre_id || null,
      padre_id: padreId,
      padre_pajilla_nombre: padrePajillaNombre,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe una vaca con ese número de identificación");
    throw new Error("No se pudo actualizar la vaca");
  }
  revalidatePath("/dashboard/vacas");
  revalidatePath(`/dashboard/vacas/${id}`);
}

export async function venderVaca(id: string) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("vacas")
    .update({ alta: false })
    .eq("id", id);

  if (error) throw new Error("No se pudo dar de baja la vaca");
  revalidatePath("/dashboard/vacas");
}

export async function deleteVaca(id: string) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase.from("vacas").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") throw new Error("No se puede eliminar esta vaca porque tiene crías u otros registros asociados");
    throw new Error("No se pudo eliminar la vaca");
  }
  revalidatePath("/dashboard/vacas");
}
