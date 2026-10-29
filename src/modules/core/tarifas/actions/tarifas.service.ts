import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRolTenant } from "../../auth/guards";
import { traducirErrorRpc, type Result } from "../../rpc/call-rpc";
import { mensajeRpc } from "../../rpc/mensajes";
import { requireModulo } from "../../tenants/tenant.guards";
import { RUTA_CONFIGURACION } from "../../parametros/actions/parametros.service";
import { buscarConceptoTarifaDinamico, getConceptoTarifa } from "../registry";
import { MARGEN_VIGENCIA_MS, crearTarifaSchema, type CrearTarifaInput } from "../schemas/tarifas.schemas";

// Lógica de las acciones de tarifas. Sin "use server": el Server Action real está en
// `src/app/dashboard/tarifas/actions.ts` (ver `parametros.service.ts`).

function datosInvalidos(mensaje: string): Result<never> {
  return { ok: false, code: "datos_invalidos", message: mensaje };
}

/**
 * Crea una tarifa nueva. Las tarifas son append-only: corregir una es insertar otra con su `vigente_desde`.
 * Sin `vigenteDesde` rige desde el momento de guardar; con fecha futura queda programada. No se admiten
 * vigencias pasadas: una tarifa nueva solo afecta a lo que se registre después (HU-F1-09).
 */
export async function crearTarifa(input: CrearTarifaInput): Promise<Result<{ id: string }>> {
  await requireRolTenant(["owner", "admin"]);
  const parsed = crearTarifaSchema.safeParse(input);
  if (!parsed.success) return datosInvalidos(parsed.error.issues[0]?.message ?? mensajeRpc("datos_invalidos"));

  const { concepto, valor, vigenteDesde, observaciones } = parsed.data;
  const def = getConceptoTarifa(concepto) ?? (await buscarConceptoTarifaDinamico(concepto));
  if (!def) return datosInvalidos("Ese concepto no tiene tarifa configurable.");
  await requireModulo(def.modulo);

  if (vigenteDesde && new Date(vigenteDesde).getTime() < Date.now() - MARGEN_VIGENCIA_MS) {
    return datosInvalidos("La vigencia no puede estar en el pasado: una tarifa nueva solo afecta a lo que se registre después.");
  }

  const supabase = await createClient();
  // `tenant_id` lo estampa el DEFAULT `tenant_actual()`; `unidad` sale de la definición del concepto.
  const { data, error } = await supabase
    .from("tarifas")
    .insert({ concepto, valor, unidad: def.unidad, observaciones, ...(vigenteDesde ? { vigente_desde: vigenteDesde } : {}) })
    .select("id")
    .single();
  if (error) {
    // 23505: ya hay una tarifa de este concepto con ese mismo instante de vigencia.
    if (error.code === "23505") {
      return { ok: false, code: "duplicado", message: "Ya hay una tarifa de este concepto con esa fecha de vigencia." };
    }
    return traducirErrorRpc("public", "tarifas", error);
  }
  revalidatePath(RUTA_CONFIGURACION);
  return { ok: true, data };
}

/**
 * Borra una tarifa PROGRAMADA (aún no vigente). El RLS solo deja borrar las de `vigente_desde > now()`; una
 * ya vigente o pasada no se toca: se corrige insertando otra. Si no se borró nada, se dice por qué.
 */
export async function eliminarTarifaProgramada(id: string): Promise<Result<{ id: string }>> {
  await requireRolTenant(["owner", "admin"]);
  if (!z.uuid().safeParse(id).success) return datosInvalidos("La tarifa indicada no es válida.");

  const supabase = await createClient();
  const { data, error } = await supabase.from("tarifas").delete().eq("id", id).select("id");
  if (error) return traducirErrorRpc("public", "tarifas", error);
  if (data.length === 0) {
    return {
      ok: false,
      code: "tarifa_no_eliminable",
      message: mensajeRpc("tarifa_no_eliminable"),
    };
  }
  revalidatePath(RUTA_CONFIGURACION);
  return { ok: true, data: { id } };
}
