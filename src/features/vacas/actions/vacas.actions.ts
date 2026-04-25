"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import type { Vaca, VacaDetalle, VacaEstado, VacaOrigen, CriaAnimal } from "@/types";

const SELECT_FIELDS =
  "id, created_at, vaca_id, nombre, origen, estado, fecha_compra, fecha_nacimiento, numero_registro, madre_id, padre_id, alta, madre:madre_id(nombre), padre:padre_id(nombre)";

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
    alta: row.alta,
  };
}

export async function getVacas(): Promise<Vaca[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vacas")
    .select(SELECT_FIELDS)
    .order("vaca_id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function getVacasDeAlta(): Promise<Vaca[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vacas")
    .select(SELECT_FIELDS)
    .eq("alta", true)
    .order("vaca_id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
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
      .eq("madre_id", id)
      .order("vaca_id", { ascending: true }),
    supabase
      .from("toros")
      .select("id, toro_id, nombre, estado, alta")
      .eq("madre_id", id)
      .order("toro_id", { ascending: true }),
  ]);

  const madreRaw = Array.isArray(vaca.madre) ? vaca.madre[0] : vaca.madre;
  const padreRaw = Array.isArray(vaca.padre) ? vaca.padre[0] : vaca.padre;

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
    ...mapRow({ ...vaca, madre: vaca.madre, padre: vaca.padre }),
    padre: padreRaw ? { id: padreRaw.id, toro_id: padreRaw.toro_id, nombre: padreRaw.nombre } : null,
    madre: madreRaw ? { id: madreRaw.id, vaca_id: madreRaw.vaca_id, nombre: madreRaw.nombre } : null,
    crias,
  };
}

export async function createVaca(formData: {
  vaca_id: number;
  nombre: string;
  origen: VacaOrigen;
  estado: VacaEstado;
  fecha_compra?: Date | null;
  fecha_nacimiento?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
  padre_id?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("vacas").insert({
    vaca_id: formData.vaca_id,
    nombre: formData.nombre,
    origen: formData.origen,
    estado: formData.estado,
    fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
    fecha_nacimiento: formData.fecha_nacimiento ? formatDate(formData.fecha_nacimiento) : null,
    numero_registro: formData.numero_registro || null,
    madre_id: formData.madre_id || null,
    padre_id: formData.padre_id || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/vacas");
}

export async function updateVaca(
  id: string,
  formData: {
    vaca_id: number;
    nombre: string;
    origen: VacaOrigen;
    estado: VacaEstado;
    fecha_compra?: Date | null;
    fecha_nacimiento?: Date | null;
    numero_registro?: string;
    madre_id?: string | null;
    padre_id?: string | null;
  }
) {
  const supabase = await createClient();
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
      padre_id: formData.padre_id || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/vacas");
  revalidatePath(`/dashboard/vacas/${id}`);
}

export async function venderVaca(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vacas")
    .update({ alta: false })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/vacas");
}

export async function deleteVaca(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("vacas").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/vacas");
}
