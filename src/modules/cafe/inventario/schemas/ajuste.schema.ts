import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { parsearPrecio } from "../../compras/lib/compra";
import { parsearUnidades } from "../../empaque/lib/empaque";
import { parsearDecimal } from "../../procesos/lib/numero";
import { CLASES_CARGA, MOTIVOS_AJUSTE } from "../lib/ajuste";

// Mismas reglas que `cafe.ajustar_inventario()` y `cafe.carga_inicial()` (la base las repite: es la frontera real).
// `message` en vez de `required_error`: Zod 4 ya no lo acepta. Las cantidades llegan como texto del formulario
// (enteros con punto de miles; kg y costos con coma decimal) y el schema las normaliza, en el navegador y en el Server Action.

const MAX = 999_999;

const observacion = z
  .string()
  .trim()
  .max(500, "La observación admite hasta 500 caracteres.")
  .nullish()
  .transform((v) => (v ? v : null));

/** Entero de cero en adelante (la «cantidad nueva» puede ser 0), tecleado con punto de miles opcional. */
function enteroDesdeCero(texto: string | number): number | null {
  if (typeof texto === "number") return Number.isInteger(texto) && texto >= 0 ? texto : null;
  if (texto.trim() === "0") return 0;
  return parsearUnidades(texto);
}

export const ajusteInventarioSchema = z
  .object({
    articuloId: z.uuid({ message: "Elegir un producto." }),
    modo: z.enum(["nueva", "diferencia"], { message: "Elegir si se indica la cantidad nueva o la diferencia." }),
    cantidad: z.union([z.number(), z.string()], { message: "Indicar la cantidad." }),
    direccion: z
      .enum(["suma", "resta"], { message: "Indicar si la diferencia suma o resta." })
      .nullish()
      .transform((v) => v ?? null),
    motivo: z.enum(MOTIVOS_AJUSTE, { message: "Elegir el motivo del ajuste." }),
    observacion,
  })
  .transform((v, ctx) => {
    const n = enteroDesdeCero(v.cantidad);
    if (n === null || n > MAX || (v.modo === "diferencia" && n === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["cantidad"],
        message: v.modo === "nueva" ? "La cantidad nueva es un número entero, de cero en adelante." : "La diferencia es un número entero mayor que cero.",
      });
      return z.NEVER;
    }
    if (v.modo === "diferencia" && !v.direccion) {
      ctx.addIssue({ code: "custom", path: ["direccion"], message: "Indicar si la diferencia suma o resta." });
      return z.NEVER;
    }
    return { ...v, cantidad: n };
  });

export type AjusteInventarioFormInput = z.input<typeof ajusteInventarioSchema>;
export type AjusteInventarioValues = z.output<typeof ajusteInventarioSchema>;

/** Los nombres que espera `cafe.ajustar_inventario`: la diferencia lleva el signo. */
export function payloadAjusteInventario(v: AjusteInventarioValues): Json {
  return {
    articulo_id: v.articuloId,
    modo: v.modo,
    cantidad: v.modo === "diferencia" && v.direccion === "resta" ? -v.cantidad : v.cantidad,
    motivo: v.motivo,
    observacion: v.observacion,
  };
}

export const cargaInicialSchema = z
  .object({
    clase: z.enum(CLASES_CARGA, { message: "Elegir qué inventario se carga." }),
    articuloId: z.uuid().nullish().transform((v) => v ?? null),
    tipoCafeId: z.uuid().nullish().transform((v) => v ?? null),
    cantidad: z.union([z.number(), z.string()], { message: "Indicar la cantidad." }),
    costoUnitario: z.union([z.number(), z.string()], { message: "Indicar el costo unitario estimado." }),
    observacion,
  })
  .transform((v, ctx) => {
    if (v.clase === "producto" && !v.articuloId) {
      ctx.addIssue({ code: "custom", path: ["articuloId"], message: "Elegir un producto." });
      return z.NEVER;
    }
    if (v.clase !== "producto" && !v.tipoCafeId) {
      ctx.addIssue({ code: "custom", path: ["tipoCafeId"], message: "Elegir un tipo de café." });
      return z.NEVER;
    }
    const cantidad = v.clase === "producto" ? parsearUnidades(v.cantidad) : parsearDecimal(v.cantidad);
    if (cantidad === null || cantidad <= 0 || cantidad >= 1_000_000) {
      ctx.addIssue({
        code: "custom",
        path: ["cantidad"],
        message: v.clase === "producto" ? "Las unidades son un número entero mayor que cero." : "Los kilos son un número mayor que cero.",
      });
      return z.NEVER;
    }
    if (v.clase !== "producto" && Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) > 1e-6) {
      ctx.addIssue({ code: "custom", path: ["cantidad"], message: "Usar como máximo 3 decimales (gramos)." });
      return z.NEVER;
    }
    const costo = typeof v.costoUnitario === "number" ? v.costoUnitario : parsearPrecio(v.costoUnitario);
    if (costo === null || !Number.isFinite(costo) || costo < 0 || costo >= 1_000_000_000 || Math.abs(costo * 100 - Math.round(costo * 100)) > 1e-6) {
      ctx.addIssue({ code: "custom", path: ["costoUnitario"], message: "El costo unitario es un valor de cero en adelante, con hasta 2 decimales." });
      return z.NEVER;
    }
    return { ...v, cantidad, costoUnitario: costo };
  });

export type CargaInicialFormInput = z.input<typeof cargaInicialSchema>;
export type CargaInicialValues = z.output<typeof cargaInicialSchema>;

export function payloadCargaInicial(v: CargaInicialValues): Json {
  return {
    clase: v.clase,
    articulo_id: v.clase === "producto" ? v.articuloId : null,
    tipo_cafe_id: v.clase === "producto" ? null : v.tipoCafeId,
    cantidad: v.cantidad,
    costo_unitario: v.costoUnitario,
    observacion: v.observacion,
  };
}
