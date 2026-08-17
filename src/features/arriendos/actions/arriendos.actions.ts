"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";
import { requireModuloTenant } from "@/lib/auth/get-tenant";
import type { AbonoArriendo, Arriendo } from "@/types";

/**
 * Subconcepto de gasto donde caen los abonos. Ya existía en la taxonomía de Villa Blanca
 * (bajo "Operación y mantenimiento"), así que no hizo falta sembrarlo en la migración.
 */
const SUBCONCEPTO_ARRIENDO = "Arriendos";

/** Marca de los gastos generados por un abono; los separa de los manuales. */
const SOURCE_ABONO = "arriendo_abono";

const CAMPOS_ABONO = "id, arriendo_id, fecha, valor, observaciones, gasto_id, created_at";
const CAMPOS_ARRIENDO =
  "id, arrendatario, finca_nombre, fecha_inicio, fecha_fin, canon, observaciones, created_at";

/**
 * Rol + módulo. El rol lo comprueba también RLS, pero el módulo no: la lista de clientes
 * con arriendos vive en el código, y cada acción exportada desde este fichero es un
 * endpoint POST público al que se puede llamar sin pasar por la barra lateral.
 */
async function autorizarLectura() {
  await requireRole(["admin", "user", "viewer"]);
  await requireModuloTenant("arriendos");
}

async function autorizarEscritura() {
  await requireRole(["admin", "user"]);
  await requireModuloTenant("arriendos");
}

/** Las tres vistas que cambian cuando se toca un arriendo o un abono. */
function revalidarVistasArriendos() {
  revalidatePath("/dashboard/arriendos");
  revalidatePath("/dashboard/gastos");
  revalidatePath("/dashboard");
}

// ============================================================================
// LECTURA
// ============================================================================

/**
 * Arriendos con sus abonos y el saldo ya calculado.
 *
 * `total_abonado` y `saldo` **no se guardan**: se derivan aquí en cada lectura, igual que
 * las alertas o los días en leche. Guardarlos obligaría a mantenerlos al día en cada alta,
 * edición y borrado de abono, con el riesgo de que se desincronicen.
 */
export async function getArriendos(): Promise<Arriendo[]> {
  await autorizarLectura();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("arriendos")
    .select(`${CAMPOS_ARRIENDO}, arriendos_abonos(${CAMPOS_ABONO})`)
    .order("fecha_inicio", { ascending: false });

  if (error) throw new Error("No se pudieron cargar los arriendos");

  return (data ?? []).map((row: any) => {
    const abonos: AbonoArriendo[] = (row.arriendos_abonos ?? [])
      .map((a: any) => ({
        id: a.id,
        arriendo_id: a.arriendo_id,
        fecha: a.fecha,
        valor: a.valor,
        observaciones: a.observaciones ?? null,
        gasto_id: a.gasto_id ?? null,
        created_at: a.created_at,
      }))
      .sort((a: AbonoArriendo, b: AbonoArriendo) => b.fecha.localeCompare(a.fecha));

    const total_abonado = abonos.reduce((suma, abono) => suma + abono.valor, 0);

    return {
      id: row.id,
      arrendatario: row.arrendatario,
      finca_nombre: row.finca_nombre,
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin,
      canon: row.canon,
      observaciones: row.observaciones ?? null,
      created_at: row.created_at,
      abonos,
      total_abonado,
      saldo: row.canon - total_abonado,
    };
  });
}

// ============================================================================
// GASTO ESPEJO DE CADA ABONO
// ============================================================================

async function subconceptoArriendoId(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("subconceptos_gasto")
    .select("id")
    .eq("nombre", SUBCONCEPTO_ARRIENDO)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data?.id) {
    throw new Error(
      `No existe el subconcepto de gasto "${SUBCONCEPTO_ARRIENDO}": créalo en Configuración antes de registrar abonos`
    );
  }
  return data.id as number;
}

interface DatosGastoAbono {
  fecha: string;
  valor: number;
  arrendatario: string;
  finca_nombre: string;
  observaciones: string | null;
}

function observacionesGasto(datos: DatosGastoAbono): string {
  const base = `Abono de arriendo · ${datos.finca_nombre}`;
  return datos.observaciones ? `${base} — ${datos.observaciones}` : base;
}

/**
 * Crea o actualiza el gasto espejo del abono y devuelve su id.
 *
 * Se marca `pagado: true` porque un abono es dinero ya entregado al arrendador, no una
 * factura pendiente: en el listado de gastos no debe figurar como deuda. La fecha del
 * gasto es la del abono, que es lo que hace que cuente en el mes en que se paga.
 *
 * Si el gasto vinculado ya no existe (alguien lo borró a mano desde el módulo de gastos),
 * el UPDATE afecta a 0 filas y se regenera uno nuevo. El `subconcepto_id` solo se fija al
 * crearlo: si después se recategoriza el gasto a mano, esa decisión se respeta.
 */
async function upsertGastoAbono(
  supabase: SupabaseClient,
  gastoId: number | null,
  datos: DatosGastoAbono
): Promise<number> {
  const payload = {
    fecha: datos.fecha,
    valor: datos.valor,
    proveedor: datos.arrendatario,
    observaciones: observacionesGasto(datos),
    pagado: true,
    source: SOURCE_ABONO,
  };

  if (gastoId !== null) {
    const { data, error } = await supabase
      .from("gastos")
      .update(payload)
      .eq("id", gastoId)
      .eq("source", SOURCE_ABONO)
      .select("id");

    if (error) throw new Error("No se pudo actualizar el gasto del abono");
    if (data && data.length > 0) return gastoId;
  }

  const subconcepto_id = await subconceptoArriendoId(supabase);
  const { data, error } = await supabase
    .from("gastos")
    .insert({ ...payload, subconcepto_id })
    .select("id")
    .single();

  if (error) throw new Error("No se pudo registrar el gasto del abono");
  return data.id as number;
}

/** Borra el gasto espejo de un abono. No toca los gastos manuales (filtra por `source`). */
async function borrarGastoAbono(supabase: SupabaseClient, gastoId: number | null) {
  if (gastoId === null) return;
  const { error } = await supabase
    .from("gastos")
    .delete()
    .eq("id", gastoId)
    .eq("source", SOURCE_ABONO);

  if (error) throw new Error("No se pudo eliminar el gasto asociado al abono");
}

/** Datos del contrato que se copian al gasto (proveedor y texto de observaciones). */
async function cargarArriendo(
  supabase: SupabaseClient,
  arriendoId: string
): Promise<{ arrendatario: string; finca_nombre: string }> {
  const { data, error } = await supabase
    .from("arriendos")
    .select("arrendatario, finca_nombre")
    .eq("id", arriendoId)
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar el arriendo");
  if (!data) throw new Error("El arriendo ya no existe");
  return data as unknown as { arrendatario: string; finca_nombre: string };
}

// ============================================================================
// ARRIENDOS
// ============================================================================

interface ArriendoFormData {
  arrendatario: string;
  finca_nombre: string;
  fecha_inicio: Date;
  fecha_fin: Date;
  canon: number;
  observaciones?: string;
}

export async function createArriendo(formData: ArriendoFormData) {
  await autorizarEscritura();
  const supabase = await createClient();

  const { error } = await supabase.from("arriendos").insert({
    arrendatario: formData.arrendatario,
    finca_nombre: formData.finca_nombre,
    fecha_inicio: formatDate(formData.fecha_inicio),
    fecha_fin: formatDate(formData.fecha_fin),
    canon: formData.canon,
    observaciones: formData.observaciones || null,
  });

  if (error) throw new Error("No se pudo registrar el arriendo");

  revalidarVistasArriendos();
}

/**
 * Al cambiar arrendatario o finca hay que rehacer los gastos de todos sus abonos: el
 * proveedor y el texto de observaciones salen del contrato, así que si no se resincronizan
 * quedan apuntando al arrendatario anterior.
 */
export async function updateArriendo(id: string, formData: ArriendoFormData) {
  await autorizarEscritura();
  const supabase = await createClient();

  const { error } = await supabase
    .from("arriendos")
    .update({
      arrendatario: formData.arrendatario,
      finca_nombre: formData.finca_nombre,
      fecha_inicio: formatDate(formData.fecha_inicio),
      fecha_fin: formatDate(formData.fecha_fin),
      canon: formData.canon,
      observaciones: formData.observaciones || null,
    })
    .eq("id", id);

  if (error) throw new Error("No se pudo actualizar el arriendo");

  const { data: abonos } = await supabase
    .from("arriendos_abonos")
    .select("id, fecha, valor, observaciones, gasto_id")
    .eq("arriendo_id", id);

  type AbonoASincronizar = Pick<
    AbonoArriendo,
    "id" | "fecha" | "valor" | "observaciones" | "gasto_id"
  >;

  for (const abono of (abonos ?? []) as unknown as AbonoASincronizar[]) {
    const gastoId = await upsertGastoAbono(supabase, abono.gasto_id, {
      fecha: abono.fecha,
      valor: abono.valor,
      arrendatario: formData.arrendatario,
      finca_nombre: formData.finca_nombre,
      observaciones: abono.observaciones,
    });
    if (gastoId !== abono.gasto_id) {
      await supabase.from("arriendos_abonos").update({ gasto_id: gastoId }).eq("id", abono.id);
    }
  }

  revalidarVistasArriendos();
}

/**
 * Los abonos se van en cascada con el arriendo, pero sus gastos **no**: hay que borrarlos
 * antes a mano o quedarían huérfanos inflando los gastos del mes.
 */
export async function deleteArriendo(id: string) {
  await autorizarEscritura();
  const supabase = await createClient();

  const { data: abonos, error: abonosError } = await supabase
    .from("arriendos_abonos")
    .select("gasto_id")
    .eq("arriendo_id", id);

  if (abonosError) throw new Error("No se pudieron cargar los abonos del arriendo");

  const gastoIds = ((abonos ?? []) as unknown as { gasto_id: number | null }[])
    .map((a) => a.gasto_id)
    .filter((gastoId): gastoId is number => gastoId !== null);

  if (gastoIds.length > 0) {
    const { error: gastosError } = await supabase
      .from("gastos")
      .delete()
      .in("id", gastoIds)
      .eq("source", SOURCE_ABONO);

    if (gastosError) throw new Error("No se pudieron eliminar los gastos de los abonos");
  }

  const { error } = await supabase.from("arriendos").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar el arriendo");

  revalidarVistasArriendos();
}

// ============================================================================
// ABONOS
// ============================================================================

interface AbonoFormData {
  fecha: Date;
  valor: number;
  observaciones?: string;
}

export async function createAbono(arriendoId: string, formData: AbonoFormData) {
  await autorizarEscritura();
  const supabase = await createClient();

  const arriendo = await cargarArriendo(supabase, arriendoId);
  const fecha = formatDate(formData.fecha);
  const observaciones = formData.observaciones || null;

  const gastoId = await upsertGastoAbono(supabase, null, {
    fecha,
    valor: formData.valor,
    arrendatario: arriendo.arrendatario,
    finca_nombre: arriendo.finca_nombre,
    observaciones,
  });

  const { error } = await supabase.from("arriendos_abonos").insert({
    arriendo_id: arriendoId,
    fecha,
    valor: formData.valor,
    observaciones,
    gasto_id: gastoId,
  });

  if (error) {
    // El gasto se creó primero para poder guardar su id en el abono; si el abono no llega
    // a insertarse hay que devolverlo, o queda un gasto sin dueño (mismo criterio que el
    // reintegro de pajillas cuando falla el alta del evento).
    await borrarGastoAbono(supabase, gastoId);
    throw new Error("No se pudo registrar el abono");
  }

  revalidarVistasArriendos();
}

export async function updateAbono(id: string, formData: AbonoFormData) {
  await autorizarEscritura();
  const supabase = await createClient();

  const { data: abonoRow, error: fetchError } = await supabase
    .from("arriendos_abonos")
    .select("arriendo_id, gasto_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw new Error("No se pudo cargar el abono");
  if (!abonoRow) throw new Error("El abono ya no existe");

  const abono = abonoRow as unknown as { arriendo_id: string; gasto_id: number | null };
  const arriendo = await cargarArriendo(supabase, abono.arriendo_id);
  const fecha = formatDate(formData.fecha);
  const observaciones = formData.observaciones || null;

  const { error } = await supabase
    .from("arriendos_abonos")
    .update({ fecha, valor: formData.valor, observaciones })
    .eq("id", id);

  if (error) throw new Error("No se pudo actualizar el abono");

  const gastoId = await upsertGastoAbono(supabase, abono.gasto_id, {
    fecha,
    valor: formData.valor,
    arrendatario: arriendo.arrendatario,
    finca_nombre: arriendo.finca_nombre,
    observaciones,
  });

  if (gastoId !== abono.gasto_id) {
    await supabase.from("arriendos_abonos").update({ gasto_id: gastoId }).eq("id", id);
  }

  revalidarVistasArriendos();
}

/**
 * Borra primero el gasto y después el abono: al revés, un fallo en el segundo paso dejaría
 * un gasto automático sin abono al que volver. En este orden, si falla el borrado del abono
 * basta con repetir la operación (el borrado del gasto ya no encuentra nada y no falla).
 */
export async function deleteAbono(id: string) {
  await autorizarEscritura();
  const supabase = await createClient();

  const { data, error: fetchError } = await supabase
    .from("arriendos_abonos")
    .select("gasto_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw new Error("No se pudo cargar el abono");
  if (!data) return;

  await borrarGastoAbono(supabase, (data as unknown as { gasto_id: number | null }).gasto_id);

  const { error } = await supabase.from("arriendos_abonos").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar el abono");

  revalidarVistasArriendos();
}
