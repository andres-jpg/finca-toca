import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { kgATostar, mensajeSumaPerfiles, sumaCuadra, type PerfilRecepcion } from "../lib/perfiles";
import { MODOS_MOLIENDA } from "../../procesos/lib/molienda";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. Mismas reglas que
// `cafe.registrar_recepcion()` (la base las repite: es la frontera real) para que el formulario avise antes.

/** Servicios que se eligen. El empaque no: va incluido si hay tostión (lo añade la base). */
export const SERVICIOS_RECEPCION = ["trilla", "tostion", "molienda"] as const;
export const NIVELES_TUESTE = ["bajo", "medio", "alto"] as const;

const HUMEDAD_MSG = "La humedad debe estar entre 0 y 100 %";
const DENSIDAD_MSG = "La densidad debe ser mayor que cero";
const TEMP_MSG = "La temperatura debe estar entre 1 y 400 °C";
const MOLIENDA_KG_MSG = "Indica los kilos a moler (mayores que cero)";
const TIEMPO_MSG = "El tiempo debe estar entre 1 y 120 minutos";

/** Vacío o ausente = `null` (no se midió). */
const opcional = <T extends z.ZodType<number>>(schema: T) => schema.nullish().transform((v) => v ?? null);

export const MODOS_PERFIL = ["uno", "varios"] as const;
/** Máximo de perfiles por lote (igual que la RPC). */
export const MAX_PERFILES = 20;
/** Merma de referencia de la trilla por defecto (`PARAMETROS_CAFE.mermaReferenciaTrillaPct`). */
const MERMA_TRILLA_DEFECTO = 19;

/** Fila de «Varios perfiles»: nivel, temperatura, tiempo y kilos. */
const perfilFilaSchema = z.object({
  nivel: z.enum(NIVELES_TUESTE, { message: "Elige el nivel de tueste" }),
  tempC: opcional(z.number({ message: TEMP_MSG }).min(1, TEMP_MSG).max(400, TEMP_MSG)),
  tiempoMin: opcional(z.number({ message: TIEMPO_MSG }).min(1, TIEMPO_MSG).max(120, TIEMPO_MSG)),
  /** Obligatorio con varios perfiles (se valida abajo); con uno, la base toma todos los kilos del lote. */
  kg: z.number({ message: "Indica los kilos del perfil" }).nullish().transform((v) => v ?? null),
});

/**
 * Esquema de la recepción. `mermaTrillaPct` es la merma de referencia de la trilla del cliente: con ella se calcula
 * lo que entra a la tostión, contra lo que deben sumar los kilos de «Varios perfiles».
 */
export function crearRecepcionSchema(mermaTrillaPct: number = MERMA_TRILLA_DEFECTO) {
  return construirSchema(mermaTrillaPct);
}

function construirSchema(mermaTrillaPct: number) {
  return z
  .object({
    terceroId: z.uuid({ message: "Elige el cliente" }),
    /** `YYYY-MM-DD` en la zona del cliente. */
    fecha: z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
    pesoKg: z
      .number({ message: "Indica el peso recibido" })
      .refine(Number.isFinite, { message: "Indica el peso recibido" })
      .gt(0, "El peso debe ser mayor que cero")
      .max(9_999_999, "El peso es demasiado grande"),
    humedadPct: opcional(
      z.number({ message: HUMEDAD_MSG }).min(0, HUMEDAD_MSG).max(100, HUMEDAD_MSG),
    ),
    densidad: opcional(
      z.number({ message: DENSIDAD_MSG }).gt(0, DENSIDAD_MSG).max(99_999, DENSIDAD_MSG),
    ),
    servicios: z.array(z.enum(SERVICIOS_RECEPCION, { message: "Servicio no válido" })).min(1, "Elige al menos un servicio"),
    nivelTueste: z
      .enum(NIVELES_TUESTE, { message: "Elige el nivel de tueste" })
      .nullish()
      .transform((v) => v ?? null),
    /** Perfil pedido por el cliente (opcional, solo con tostión). */
    perfilTempC: opcional(z.number({ message: TEMP_MSG }).min(1, TEMP_MSG).max(400, TEMP_MSG)),
    perfilTiempoMin: opcional(z.number({ message: TIEMPO_MSG }).min(1, TIEMPO_MSG).max(120, TIEMPO_MSG)),
    /** `uno` = un perfil para todo el lote (nivel, °C y min de arriba); `varios` = filas de `perfiles` con sus kilos. */
    modoPerfil: z.enum(MODOS_PERFIL, { message: "Elige cómo tostar" }).default("uno"),
    perfiles: z.array(perfilFilaSchema).max(MAX_PERFILES, "Demasiados perfiles").default([]),
    /** Cantidad a moler (B-03); solo con molienda contratada. «ninguna» no se elige aquí: es lo que se guarda sin molienda. */
    moliendaModo: z
      .enum(MODOS_MOLIENDA.filter((m) => m !== "ninguna") as ["todo", "mitad", "kg"], { message: "Elige la cantidad a moler" })
      .nullish()
      .transform((v) => v ?? null),
    moliendaKg: opcional(z.number({ message: MOLIENDA_KG_MSG }).gt(0, MOLIENDA_KG_MSG).max(9_999_999, MOLIENDA_KG_MSG)),
    observaciones: z
      .string()
      .trim()
      .max(500, "Máximo 500 caracteres")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((v, ctx) => {
    const tostion = v.servicios.includes("tostion");
    if (v.servicios.includes("molienda") && !tostion) {
      ctx.addIssue({ code: "custom", path: ["servicios"], message: "La molienda requiere tostión" });
    }
    if (v.servicios.includes("molienda")) {
      const modo = v.moliendaModo ?? "todo";
      if (modo === "kg" && v.moliendaKg === null) {
        ctx.addIssue({ code: "custom", path: ["moliendaKg"], message: MOLIENDA_KG_MSG });
      }
    }
    if (tostion && v.modoPerfil === "uno" && !v.nivelTueste) {
      ctx.addIssue({ code: "custom", path: ["nivelTueste"], message: "Elige el nivel de tueste" });
    }
    if (tostion && v.modoPerfil === "varios") {
      v.perfiles.forEach((p, i) => {
        if (p.kg === null || !Number.isFinite(p.kg)) {
          ctx.addIssue({ code: "custom", path: ["perfiles", i, "kg"], message: "Indica los kilos del perfil" });
        } else if (p.kg <= 0 || p.kg > 9_999_999) {
          ctx.addIssue({ code: "custom", path: ["perfiles", i, "kg"], message: "Los kilos del perfil deben ser mayores que cero" });
        }
      });
      if (v.perfiles.length < 2) {
        ctx.addIssue({ code: "custom", path: ["perfiles"], message: "Agrega al menos dos perfiles" });
      } else {
        // La suma de kilos debe igualar lo que entra a la tostión (estimado tras la trilla si la hay).
        const kgTostar = kgATostar(v.pesoKg, v.servicios, mermaTrillaPct);
        if (!sumaCuadra(v.perfiles, kgTostar)) {
          ctx.addIssue({ code: "custom", path: ["perfiles"], message: mensajeSumaPerfiles(kgTostar) });
        }
      }
    }
  })
  // Sin tostión no hay nivel de tueste (el CHECK de la tabla lo exige nulo).
  // Tampoco perfil (temperatura/tiempo): solo cuelga de la tostión.
  .transform((v) => {
    const tostion = v.servicios.includes("tostion");
    const varios = tostion && v.modoPerfil === "varios";
    // Perfiles tal como van a la base: con «uno», un solo perfil sin kilos (son todos los del lote); con «varios», las filas.
    const perfiles: PerfilRecepcion[] = !tostion
      ? []
      : varios
        ? v.perfiles.map((p) => ({ nivel: p.nivel, tempC: p.tempC, tiempoMin: p.tiempoMin, kg: p.kg }))
        : v.nivelTueste
          ? [{ nivel: v.nivelTueste, tempC: v.perfilTempC, tiempoMin: v.perfilTiempoMin, kg: null }]
          : [];
    return {
      ...v,
      modoPerfil: tostion ? v.modoPerfil : ("uno" as const),
      nivelTueste: varios ? perfiles[0].nivel : tostion ? v.nivelTueste : null,
      perfilTempC: varios ? perfiles[0].tempC : tostion ? v.perfilTempC : null,
      perfilTiempoMin: varios ? perfiles[0].tiempoMin : tostion ? v.perfilTiempoMin : null,
      perfiles,
      // Sin molienda contratada no hay cantidad a moler (la base guarda «ninguna»).
      moliendaModo: v.servicios.includes("molienda") ? (v.moliendaModo ?? ("todo" as const)) : null,
      moliendaKg: v.servicios.includes("molienda") && v.moliendaModo === "kg" ? v.moliendaKg : null,
    };
  });
}

export const recepcionSchema = construirSchema(MERMA_TRILLA_DEFECTO);

export type RecepcionFormInput = z.input<typeof recepcionSchema>;
export type RecepcionValues = z.output<typeof recepcionSchema>;

/** Carga que espera `cafe.registrar_recepcion(p)`. `tenant_id` y el código los pone la base. */
export function payloadRecepcion(v: RecepcionValues): Record<string, Json> {
  return {
    tercero_id: v.terceroId,
    fecha: v.fecha,
    peso_kg: v.pesoKg,
    humedad_pct: v.humedadPct,
    densidad: v.densidad,
    servicios: v.servicios,
    nivel_tueste: v.nivelTueste,
    perfil_temp_c: v.perfilTempC,
    perfil_tiempo_min: v.perfilTiempoMin,
    // Con tostión, `perfiles` manda en la base; las tres claves de arriba son el perfil 1 (clientes anteriores).
    ...(v.perfiles.length > 0
      ? { perfiles: v.perfiles.map((p) => ({ nivel: p.nivel, temp_c: p.tempC, tiempo_min: p.tiempoMin, kg: p.kg })) }
      : {}),
    molienda_modo: v.moliendaModo,
    molienda_kg: v.moliendaKg,
    observaciones: v.observaciones,
  };
}
