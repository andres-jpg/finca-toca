"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";
import { sincronizarEstadosPorEdad } from "@/lib/animales/sincronizar-estados";
import type {
  Animal,
  AnimalDetalle,
  AnimalRaza,
  AnimalSexo,
  EstadoProductivo,
  EstadoReproductivo,
  VacaOrigen,
  CriaAnimal,
} from "@/types";

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
  "id, created_at, identificador, nombre, sexo, raza, origen, estado_productivo, estado_reproductivo, fecha_compra, fecha_nacimiento, numero_registro, madre_id, padre_id, padre_pajilla_nombre, alta, madre:madre_id(nombre), padre:padre_id(nombre)";

function mapRow(row: any): Animal {
  const madreRaw = Array.isArray(row.madre) ? row.madre[0] : row.madre;
  const padreRaw = Array.isArray(row.padre) ? row.padre[0] : row.padre;
  return {
    id: row.id,
    created_at: row.created_at,
    identificador: row.identificador,
    nombre: row.nombre,
    sexo: row.sexo,
    raza: row.raza,
    origen: row.origen,
    estado_productivo: row.estado_productivo,
    estado_reproductivo: row.estado_reproductivo,
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

function sortByIdentificador(a: Animal, b: Animal) {
  return a.identificador.localeCompare(b.identificador, undefined, { numeric: true });
}

export async function getAnimales(): Promise<Animal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("animales").select(SELECT_FIELDS);

  if (error) throw new Error("No se pudieron cargar los animales");
  return (data ?? []).map(mapRow).sort(sortByIdentificador);
}

export async function getAnimalesDeAlta(): Promise<Animal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("animales")
    .select(SELECT_FIELDS)
    .eq("alta", true);

  if (error) throw new Error("No se pudieron cargar los animales");
  return (data ?? []).map(mapRow).sort(sortByIdentificador);
}

export async function getAnimalById(id: string): Promise<AnimalDetalle | null> {
  const supabase = await createClient();

  const { data: animal, error } = await supabase
    .from("animales")
    .select("*, madre:madre_id(id, identificador, nombre), padre:padre_id(id, identificador, nombre)")
    .eq("id", id)
    .single();

  if (error || !animal) return null;

  const { data: criasRows } = await supabase
    .from("animales")
    .select("id, identificador, nombre, estado_productivo, estado_reproductivo, alta, sexo")
    .or(`madre_id.eq.${id},padre_id.eq.${id}`);

  const madreRaw = Array.isArray(animal.madre) ? animal.madre[0] : animal.madre;
  const padreRaw = Array.isArray(animal.padre) ? animal.padre[0] : animal.padre;

  const crias: CriaAnimal[] = (criasRows ?? [])
    .sort((a: any, b: any) =>
      String(a.identificador).localeCompare(String(b.identificador), undefined, { numeric: true })
    )
    .map((c: any) => ({
      id: c.id,
      sexo: c.sexo,
      identificador: c.identificador,
      nombre: c.nombre,
      estado_productivo: c.estado_productivo,
      estado_reproductivo: c.estado_reproductivo,
      alta: c.alta,
    }));

  return {
    ...mapRow({ ...animal, madre: animal.madre, padre: animal.padre }),
    padre: padreRaw
      ? { id: padreRaw.id, identificador: padreRaw.identificador, nombre: padreRaw.nombre }
      : null,
    madre: madreRaw
      ? { id: madreRaw.id, identificador: madreRaw.identificador, nombre: madreRaw.nombre }
      : null,
    crias,
  };
}

interface AnimalFormData {
  identificador: string;
  nombre: string;
  sexo: AnimalSexo;
  raza?: AnimalRaza | null;
  origen: VacaOrigen;
  estado_productivo?: EstadoProductivo | null;
  estado_reproductivo?: EstadoReproductivo | null;
  fecha_compra?: Date | null;
  fecha_nacimiento?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
  padre_id?: string | null;
  padre_pajilla_toro_ref_id?: string | null;
  padre_pajilla_nombre_keep?: string | null;
}

async function assertIdentificadorDisponible(
  supabase: Awaited<ReturnType<typeof createClient>>,
  identificador: string,
  sexo: AnimalSexo,
  excludeId?: string
) {
  let query = supabase
    .from("animales")
    .select("id")
    .eq("identificador", identificador)
    .eq("sexo", sexo)
    .limit(1);

  if (excludeId) query = query.neq("id", excludeId);

  const { data } = await query;
  if (data && data.length > 0) {
    throw new Error("Ya existe un animal con esa identificación para el sexo seleccionado");
  }
}

export async function createAnimal(formData: AnimalFormData) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  await assertIdentificadorDisponible(supabase, formData.identificador, formData.sexo);

  let padrePajillaNombre: string | null = null;
  let padreId: string | null = formData.padre_id || null;

  if (formData.padre_pajilla_toro_ref_id) {
    padrePajillaNombre = await consumirPajillaParaPadre(supabase, formData.padre_pajilla_toro_ref_id);
    padreId = null;
  }

  const { error } = await supabase.from("animales").insert({
    identificador: formData.identificador,
    nombre: formData.nombre,
    sexo: formData.sexo,
    raza: formData.raza || null,
    origen: formData.origen,
    estado_productivo: formData.estado_productivo || null,
    // El estado reproductivo solo aplica a hembras.
    estado_reproductivo:
      formData.sexo === "hembra" ? formData.estado_reproductivo || null : null,
    fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
    fecha_nacimiento: formData.fecha_nacimiento ? formatDate(formData.fecha_nacimiento) : null,
    numero_registro: formData.numero_registro || null,
    madre_id: formData.madre_id || null,
    padre_id: padreId,
    padre_pajilla_nombre: padrePajillaNombre,
  });

  if (error) throw new Error("No se pudo registrar el animal");
  revalidatePath("/dashboard/animales");
}

export async function updateAnimal(id: string, formData: AnimalFormData) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  // Datos históricos incluyen identificadores duplicados dentro del mismo sexo (nunca hubo
  // constraint real en la tabla toros original), así que solo se valida disponibilidad si el
  // identificador o el sexo realmente cambian — de lo contrario, editar un animal ya duplicado
  // quedaría bloqueado para siempre.
  const { data: current } = await supabase
    .from("animales")
    .select("identificador, sexo")
    .eq("id", id)
    .single();

  const identificadorOSexoCambio =
    !current || current.identificador !== formData.identificador || current.sexo !== formData.sexo;

  if (identificadorOSexoCambio) {
    await assertIdentificadorDisponible(supabase, formData.identificador, formData.sexo, id);
  }

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
    .from("animales")
    .update({
      identificador: formData.identificador,
      nombre: formData.nombre,
      sexo: formData.sexo,
      raza: formData.raza || null,
      origen: formData.origen,
      estado_productivo: formData.estado_productivo || null,
      estado_reproductivo:
        formData.sexo === "hembra" ? formData.estado_reproductivo || null : null,
      fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
      fecha_nacimiento: formData.fecha_nacimiento ? formatDate(formData.fecha_nacimiento) : null,
      numero_registro: formData.numero_registro || null,
      madre_id: formData.madre_id || null,
      padre_id: padreId,
      padre_pajilla_nombre: padrePajillaNombre,
    })
    .eq("id", id);

  if (error) throw new Error("No se pudo actualizar el animal");
  revalidatePath("/dashboard/animales");
  revalidatePath(`/dashboard/animales/${id}`);
}

export async function venderAnimal(id: string) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase.from("animales").update({ alta: false }).eq("id", id);

  if (error) throw new Error("No se pudo dar de baja el animal");
  revalidatePath("/dashboard/animales");
}

/**
 * Escape hatch manual del cron diario (`/api/cron/animales-estados`): recalcula
 * `leche` → `levante_1` → `levante_2` por edad. Devuelve cuántos animales cambiaron.
 */
export async function recalcularEstadosPorEdad(): Promise<number> {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { actualizados } = await sincronizarEstadosPorEdad(supabase);

  if (actualizados.length > 0) {
    revalidatePath("/dashboard/animales");
    revalidatePath("/dashboard");
  }
  return actualizados.length;
}

export async function deleteAnimal(id: string) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase.from("animales").delete().eq("id", id);

  if (error) {
    if (error.code === "23503")
      throw new Error("No se puede eliminar este animal porque tiene crías u otros registros asociados");
    throw new Error("No se pudo eliminar el animal");
  }
  revalidatePath("/dashboard/animales");
}
