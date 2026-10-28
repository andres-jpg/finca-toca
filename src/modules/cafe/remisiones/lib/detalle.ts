import type { Json } from "@/lib/supabase/database.types";
import { ORDEN_PROCESO } from "@/modules/cafe/lotes/lib/servicios";
import type { NivelTueste, TipoProceso } from "@/modules/cafe/lotes/types";
import type { DetalleServicio } from "../types";

// Lectura defensiva del `detalle` jsonb de una remisión. Lo escribe `cafe.generar_remision`, pero es un jsonb: una
// fila vieja o corregida a mano no debe tumbar el tiquete, así que lo que no encaja se descarta. Pura.

const NIVELES: readonly string[] = ["bajo", "medio", "alto"];

function numero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string" && valor.trim() !== "" && Number.isFinite(Number(valor))) return Number(valor);
  return null;
}

/** `detalle` → servicios en el orden de la planta (trilla, tostión, molienda, empaque). */
export function leerDetalle(json: Json | null | undefined): DetalleServicio[] {
  if (!Array.isArray(json)) return [];
  const servicios: DetalleServicio[] = [];
  for (const elemento of json) {
    if (elemento === null || typeof elemento !== "object" || Array.isArray(elemento)) continue;
    const servicio = elemento.servicio;
    if (typeof servicio !== "string" || !(servicio in ORDEN_PROCESO)) continue;
    const nivel = elemento.nivel_tueste;
    servicios.push({
      servicio: servicio as TipoProceso,
      kgEntrada: numero(elemento.kg_entrada),
      kgSalida: numero(elemento.kg_salida),
      mermaKg: numero(elemento.merma_kg),
      tarifaKg: numero(elemento.tarifa_kg),
      valor: numero(elemento.valor),
      nivelTueste: typeof nivel === "string" && NIVELES.includes(nivel) ? (nivel as NivelTueste) : null,
      incluido: elemento.incluido === true,
      pendiente: elemento.pendiente === true,
    });
  }
  return servicios.sort((a, b) => ORDEN_PROCESO[a.servicio] - ORDEN_PROCESO[b.servicio]);
}
