import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { parsearDecimal } from "../../procesos/lib/numero";
import { parsearUnidades } from "../lib/empaque";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. Mismas reglas que
// `cafe.registrar_empaque()` y `cafe.registrar_salida_pt()` (la base las repite: es la frontera real) para que el
// formulario avise antes de guardar. Los pesos aceptan texto con COMA decimal y las unidades, enteros con punto de
// miles: el formulario guarda lo que escribe el operario y el schema lo normaliza, en el navegador y en el Server Action.

const MAX_BULTOS = 200;
const MAX_KG = 10_000_000; // la base rechaza >= 10.000.000 (numeric(10,3))
const MAX_UNIDADES = 99_999;
const MAX_PRESENTACIONES = 20;

const enGramos = (n: number) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6;
const vacio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Peso de entrada opcional: vacío = `null` (la base toma el disponible); escrito pero ilegible = error. */
const kilosOpcional = z
  .union([z.number(), z.string(), z.null()], { message: "El peso de entrada debe ser un número" })
  .nullish()
  .transform((v, ctx) => {
    if (vacio(v)) return null;
    const n = parsearDecimal(v as string | number);
    if (n === null || n <= 0) {
      ctx.addIssue({ code: "custom", message: "El peso de entrada debe ser un número mayor que cero" });
      return z.NEVER;
    }
    if (n >= MAX_KG) ctx.addIssue({ code: "custom", message: "El peso es demasiado grande" });
    else if (!enGramos(n)) ctx.addIssue({ code: "custom", message: "Usa como máximo 3 decimales (gramos)" });
    return n;
  });

const unidades = z.union([z.number(), z.string()], { message: "Indica las unidades" }).transform((v, ctx) => {
  const n = parsearUnidades(v);
  if (n === null) {
    ctx.addIssue({ code: "custom", message: "Las unidades son un número entero mayor que cero" });
    return z.NEVER;
  }
  if (n > MAX_UNIDADES) ctx.addIssue({ code: "custom", message: "Las unidades son demasiadas" });
  return n;
});

export const lineaEmpaqueSchema = z.object({
  presentacionG: z
    .number({ message: "La presentación no es válida" })
    .int("La presentación son gramos enteros")
    .min(1, "La presentación no es válida")
    .max(MAX_UNIDADES, "La presentación no es válida"),
  unidades,
});

export const empaqueSchema = z
  .object({
    loteId: z.uuid({ message: "El lote no es válido" }),
    /** `YYYY-MM-DD` en la zona del cliente. */
    fecha: z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
    /** Bultos que se empacan. Un lote de un solo bulto manda el suyo (el formulario no muestra la selección). */
    bultoIds: z.array(z.uuid({ message: "Bulto no válido" })).max(MAX_BULTOS),
    /** Empaque de un café reabierto (CO-33): en vez de bultos del lote, la reapertura que se empaca. */
    reaperturaId: z
      .uuid({ message: "La reapertura no es válida" })
      .nullish()
      .transform((v) => v ?? null),
    pesoEntradaKg: kilosOpcional,
    lineas: z
      .array(lineaEmpaqueSchema)
      .min(1, "Indica las unidades de al menos una presentación")
      .max(MAX_PRESENTACIONES, "Demasiadas presentaciones"),
    observaciones: z
      .string()
      .trim()
      .max(500, "Máximo 500 caracteres")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((v, ctx) => {
    const vistas = new Set<number>();
    for (const [i, l] of v.lineas.entries()) {
      if (vistas.has(l.presentacionG)) {
        ctx.addIssue({ code: "custom", path: ["lineas", i, "presentacionG"], message: "Esa presentación está repetida" });
      }
      vistas.add(l.presentacionG);
    }
  });

export type EmpaqueFormInput = z.input<typeof empaqueSchema>;
export type EmpaqueValues = z.output<typeof empaqueSchema>;

/** Los nombres que espera `cafe.registrar_empaque` (snake_case). */
export function payloadEmpaque(v: EmpaqueValues): Json {
  return {
    lote_id: v.loteId,
    fecha: v.fecha,
    bultos: v.bultoIds,
    // Solo con un café reabierto (CO-33); sin él la RPC recibe lo mismo de siempre.
    ...(v.reaperturaId ? { reapertura_id: v.reaperturaId } : {}),
    peso_entrada_kg: v.pesoEntradaKg,
    lineas: v.lineas.map((l) => ({ presentacion_g: l.presentacionG, unidades: l.unidades })),
    observaciones: v.observaciones,
  };
}

// --- Salidas del producto terminado ----------------------------------------------------------------------------

export const MOTIVOS_SALIDA_PT = ["muestra", "perdida", "ajuste"] as const;
export type MotivoSalidaPt = (typeof MOTIVOS_SALIDA_PT)[number];

export const ETIQUETA_MOTIVO_SALIDA_PT: Record<MotivoSalidaPt, string> = {
  muestra: "Muestra",
  perdida: "Pérdida",
  ajuste: "Ajuste",
};

/** La venta y la cortesía son de CO-31; la reapertura tiene su propia acción (CO-33). Aquí solo muestra, pérdida y ajuste. */
export const salidaPtSchema = z
  .object({
    articuloId: z.uuid({ message: "Elige un producto" }),
    motivo: z.enum(MOTIVOS_SALIDA_PT, { message: "Elige el motivo de la salida" }),
    /** Solo el ajuste: un teclado numérico de tablet no tiene signo menos. */
    direccion: z
      .enum(["aumenta", "disminuye"], { message: "Indica si el ajuste aumenta o disminuye el stock" })
      .nullish()
      .transform((v) => v ?? null),
    unidades,
    observaciones: z
      .string()
      .trim()
      .max(500, "Máximo 500 caracteres")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((v, ctx) => {
    if (v.motivo === "ajuste" && !v.direccion) {
      ctx.addIssue({ code: "custom", path: ["direccion"], message: "Indica si el ajuste aumenta o disminuye el stock" });
    }
    // La pérdida y el ajuste siempre se explican; la muestra puede ir sin nota.
    if (v.motivo !== "muestra" && (v.observaciones?.length ?? 0) < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["observaciones"],
        message: v.motivo === "perdida" ? "Explica la pérdida: la observación es obligatoria" : "Un ajuste exige una observación que lo explique",
      });
    }
  });

export type SalidaPtFormInput = z.input<typeof salidaPtSchema>;
export type SalidaPtValues = z.output<typeof salidaPtSchema>;

/** Los nombres que espera `cafe.registrar_salida_pt`: muestra y pérdida van en positivo; el ajuste lleva el signo. */
export function payloadSalidaPt(v: SalidaPtValues): Json {
  return {
    articulo_id: v.articuloId,
    motivo: v.motivo,
    unidades: v.motivo === "ajuste" && v.direccion === "disminuye" ? -v.unidades : v.unidades,
    observaciones: v.observaciones,
  };
}
