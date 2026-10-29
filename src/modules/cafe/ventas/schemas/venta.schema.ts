import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { parsearPrecio } from "../../compras/lib/compra";
import { parsearUnidades } from "../../empaque/lib/empaque";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta. Mismas reglas que
// `cafe.registrar_venta()` y `cafe.anular_venta()` (la base las repite: es la frontera real) para que el formulario
// avise antes de guardar. Las unidades aceptan enteros con punto de miles y el precio, texto con formato colombiano
// («23.000», «$ 23.000,50»): el formulario guarda lo que escribe el operario y el schema lo normaliza, en el
// navegador y en el Server Action.

const MAX_LINEAS = 50;
const MAX_UNIDADES = 99_999;
const MAX_PRECIO = 999_999_999.99;
const MAX_FACTURA = 40;

const enCentavos = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const vacio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const unidades = z.union([z.number(), z.string()], { message: "Indica las unidades" }).transform((v, ctx) => {
  const n = parsearUnidades(v);
  if (n === null) {
    ctx.addIssue({ code: "custom", message: "Las unidades son un número entero mayor que cero" });
    return z.NEVER;
  }
  if (n > MAX_UNIDADES) ctx.addIssue({ code: "custom", message: "Las unidades son demasiadas" });
  return n;
});

/** Precio unitario escrito a mano; vacío = `null` (en una cortesía no se pide). Escrito pero ilegible = error. */
const precio = z
  .union([z.number(), z.string(), z.null()], { message: "El precio debe ser un número" })
  .nullish()
  .transform((v, ctx) => {
    if (vacio(v)) return null;
    const n = typeof v === "number" ? v : parsearPrecio(String(v));
    if (n === null || !Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "El precio debe ser un número válido" });
      return z.NEVER;
    }
    if (n > MAX_PRECIO) ctx.addIssue({ code: "custom", message: "El precio es demasiado grande" });
    else if (!enCentavos(n)) ctx.addIssue({ code: "custom", message: "El precio admite como máximo 2 decimales" });
    return n;
  });

export const lineaVentaSchema = z.object({
  articuloId: z.uuid({ message: "Elige un producto" }),
  cantidad: unidades,
  precio,
});

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

export const ventaSchema = z
  .object({
    tipo: z.enum(["venta", "cortesia"], { message: "Elige si es una venta o una cortesía" }),
    /** `YYYY-MM-DD` en la zona del cliente. */
    fecha: z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
    terceroId: z.uuid({ message: "Elige el cliente" }),
    requiereFactura: z.boolean().default(false),
    numeroFactura: textoOpcional(MAX_FACTURA),
    observaciones: textoOpcional(500),
    lineas: z.array(lineaVentaSchema).min(1, "Añade al menos un producto").max(MAX_LINEAS, "Demasiados productos"),
  })
  .superRefine((v, ctx) => {
    const vistos = new Set<string>();
    for (const [i, l] of v.lineas.entries()) {
      if (vistos.has(l.articuloId)) {
        ctx.addIssue({ code: "custom", path: ["lineas", i, "articuloId"], message: "Ese producto está repetido: suma las unidades en una sola línea" });
      }
      vistos.add(l.articuloId);
      if (v.tipo === "venta" && (l.precio === null || l.precio <= 0)) {
        ctx.addIssue({ code: "custom", path: ["lineas", i, "precio"], message: "Indica el precio de cada producto" });
      }
    }
    if (v.tipo === "cortesia" && v.requiereFactura) {
      ctx.addIssue({ code: "custom", path: ["requiereFactura"], message: "Una cortesía no lleva factura" });
    }
    if (v.numeroFactura && !v.requiereFactura) {
      ctx.addIssue({ code: "custom", path: ["numeroFactura"], message: "Marca «requiere factura electrónica» para guardar el número de Aliados" });
    }
  })
  // En una cortesía el precio vale 0 siempre (la base también lo fuerza).
  .transform((v) => ({
    ...v,
    lineas: v.lineas.map((l) => ({ articuloId: l.articuloId, cantidad: l.cantidad, precio: v.tipo === "cortesia" ? 0 : (l.precio ?? 0) })),
  }));

export type VentaFormInput = z.input<typeof ventaSchema>;
export type VentaValues = z.output<typeof ventaSchema>;

/** Los nombres que espera `cafe.registrar_venta` (snake_case). */
export function payloadVenta(v: VentaValues): Json {
  return {
    tipo: v.tipo,
    fecha: v.fecha,
    tercero_id: v.terceroId,
    requiere_factura: v.requiereFactura,
    numero_factura_aliados: v.numeroFactura,
    observaciones: v.observaciones,
    lineas: v.lineas.map((l) => ({ articulo_id: l.articuloId, cantidad: l.cantidad, precio_unitario: l.precio })),
  };
}

// --- Anular y completar la factura -------------------------------------------------------------------------------

export const anularVentaSchema = z.object({
  ventaId: z.uuid({ message: "La venta no es válida" }),
  motivo: z
    .string({ message: "Indica el motivo" })
    .trim()
    .min(3, "Indica el motivo de la anulación")
    .max(500, "Máximo 500 caracteres"),
});
export type AnularVentaInput = z.input<typeof anularVentaSchema>;

export const completarFacturaSchema = z.object({
  ventaId: z.uuid({ message: "La venta no es válida" }),
  numeroFactura: z
    .string({ message: "Indica el número de la factura" })
    .trim()
    .min(1, "Indica el número de la factura")
    .max(MAX_FACTURA, `Máximo ${MAX_FACTURA} caracteres`),
});
export type CompletarFacturaInput = z.input<typeof completarFacturaSchema>;
