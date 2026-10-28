import { callRpc, type Result } from "../../rpc/call-rpc";
import { createClient } from "@/lib/supabase/server";
import type { UnidadTarifa } from "../registry";
import type { TarifaHistorial, TarifaVigente } from "../types";

/**
 * Tarifa de `concepto` vigente en `fecha` (ahora si se omite), por la RPC `tarifa_vigente`. Un concepto sin
 * tarifa NO devuelve 0: da `{ ok: false, code: "tarifa_no_definida" }` con un mensaje legible, porque un
 * proceso no debe registrarse sin saber qué cobrar. Es la función que llamará el vertical al registrar un
 * proceso; dentro de una RPC se usa `public.tarifa_vigente()` directamente.
 */
export async function getTarifaVigente(concepto: string, fecha?: Date): Promise<Result<number>> {
  return callRpc<"public", "tarifa_vigente", number>("public", "tarifa_vigente", {
    p_concepto: concepto,
    ...(fecha ? { p_at: fecha.toISOString() } : {}),
  });
}

/** Tarifas que rigen ahora, una por concepto (`v_tarifas_vigentes`; RLS: solo las del cliente actual). */
export async function getTarifasVigentes(): Promise<TarifaVigente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_tarifas_vigentes").select("concepto, valor, unidad, vigente_desde");
  if (error) throw new Error(`No se pudieron leer las tarifas (${error.code ?? "sin código"})`);
  return data.map((t) => ({
    concepto: t.concepto as string,
    valor: Number(t.valor),
    unidad: t.unidad as UnidadTarifa, // CHECK de la tabla
    vigenteDesde: t.vigente_desde as string,
  }));
}

/** Historial completo con el email de quien creó cada tarifa (solo owner/admin; si no, vacío). */
export async function getHistorialTarifas(concepto?: string): Promise<TarifaHistorial[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tarifas_historial", concepto ? { p_concepto: concepto } : {});
  if (error) throw new Error(`No se pudo leer el historial de tarifas (${error.code ?? "sin código"})`);
  const ahora = Date.now();
  return data.map((t) => ({
    id: t.id,
    concepto: t.concepto,
    valor: Number(t.valor),
    unidad: t.unidad as UnidadTarifa, // CHECK de la tabla
    vigenteDesde: t.vigente_desde,
    programada: new Date(t.vigente_desde).getTime() > ahora,
    observaciones: t.observaciones,
    createdAt: t.created_at,
    email: t.email,
  }));
}
