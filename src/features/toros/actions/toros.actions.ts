"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";
import type { Toro, ToroDetalle, CriaAnimal } from "@/types";

const SELECT_FIELDS =
  "id, created_at, toro_id, nombre, origen, estado, fecha_compra, fecha_nacimiento, numero_registro, madre_id, padre_id, alta, madre:madre_id(nombre), padre:padre_id(nombre)";

function mapRow(row: any): Toro {
  const madreRaw = Array.isArray(row.madre) ? row.madre[0] : row.madre;
  const padreRaw = Array.isArray(row.padre) ? row.padre[0] : row.padre;
  return {
    id: row.id,
    created_at: row.created_at,
    toro_id: row.toro_id,
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
    alta: row.alta,
  };
}

export async function getToros(): Promise<Toro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("toros")
    .select(SELECT_FIELDS)
    .order("toro_id", { ascending: true });

  if (error) throw new Error("No se pudieron cargar los toros");
  return (data ?? []).map(mapRow);
}

export async function getTorosDeAlta(): Promise<Toro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("toros")
    .select(SELECT_FIELDS)
    .eq("alta", true)
    .order("toro_id", { ascending: true });

  if (error) throw new Error("No se pudieron cargar los toros");
  return (data ?? []).map(mapRow);
}

export async function getToroById(id: string): Promise<ToroDetalle | null> {
  const supabase = await createClient();

  const { data: toro, error } = await supabase
    .from("toros")
    .select("*, madre:madre_id(id, vaca_id, nombre), padre:padre_id(id, toro_id, nombre)")
    .eq("id", id)
    .single();

  if (error || !toro) return null;

  const [{ data: criasVacas }, { data: criasToros }] = await Promise.all([
    supabase
      .from("vacas")
      .select("id, vaca_id, nombre, estado, alta")
      .eq("madre_id", id)
      .order("vaca_id", { ascending: true }),
    supabase
      .from("toros")
      .select("id, toro_id, nombre, estado, alta")
      .eq("madre_id", id)
      .order("toro_id", { ascending: true }),
  ]);

  const madreRaw = Array.isArray(toro.madre) ? toro.madre[0] : toro.madre;
  const padreRaw = Array.isArray(toro.padre) ? toro.padre[0] : toro.padre;

  const crias: CriaAnimal[] = [
    ...(criasVacas ?? []).map((c: any) => ({
      id: c.id,
      tipo: "vaca" as const,
      animal_id: c.vaca_id,
      nombre: c.nombre,
      estado: c.estado,
      alta: c.alta,
    })),
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
    ...mapRow({ ...toro, madre: toro.madre, padre: toro.padre }),
    padre: padreRaw ? { id: padreRaw.id, toro_id: padreRaw.toro_id, nombre: padreRaw.nombre } : null,
    madre: madreRaw ? { id: madreRaw.id, vaca_id: madreRaw.vaca_id, nombre: madreRaw.nombre } : null,
    crias,
  };
}

export async function createToro(formData: {
  toro_id: number;
  nombre: string;
  origen: "finca" | "externa";
  estado?: "jardin" | "reproductor" | null;
  fecha_compra?: Date | null;
  fecha_nacimiento?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
  padre_id?: string | null;
}) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase.from("toros").insert({
    toro_id: formData.toro_id,
    nombre: formData.nombre,
    origen: formData.origen,
    estado: formData.estado || null,
    fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
    fecha_nacimiento: formData.fecha_nacimiento ? formatDate(formData.fecha_nacimiento) : null,
    numero_registro: formData.numero_registro || null,
    madre_id: formData.madre_id || null,
    padre_id: formData.padre_id || null,
  });

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un toro con ese número de identificación");
    throw new Error("No se pudo registrar el toro");
  }
  revalidatePath("/dashboard/toros");
}

export async function updateToro(
  id: string,
  formData: {
    toro_id: number;
    nombre: string;
    origen: "finca" | "externa";
    estado?: "jardin" | "reproductor" | null;
    fecha_compra?: Date | null;
    fecha_nacimiento?: Date | null;
    numero_registro?: string;
    madre_id?: string | null;
    padre_id?: string | null;
  }
) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("toros")
    .update({
      toro_id: formData.toro_id,
      nombre: formData.nombre,
      origen: formData.origen,
      estado: formData.estado || null,
      fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
      fecha_nacimiento: formData.fecha_nacimiento ? formatDate(formData.fecha_nacimiento) : null,
      numero_registro: formData.numero_registro || null,
      madre_id: formData.madre_id || null,
      padre_id: formData.padre_id || null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un toro con ese número de identificación");
    throw new Error("No se pudo actualizar el toro");
  }
  revalidatePath("/dashboard/toros");
  revalidatePath(`/dashboard/toros/${id}`);
}

export async function venderToro(id: string) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("toros")
    .update({ alta: false })
    .eq("id", id);

  if (error) throw new Error("No se pudo dar de baja el toro");
  revalidatePath("/dashboard/toros");
}

export async function deleteToro(id: string) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase.from("toros").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") throw new Error("No se puede eliminar este toro porque tiene crías u otros registros asociados");
    throw new Error("No se pudo eliminar el toro");
  }
  revalidatePath("/dashboard/toros");
}
