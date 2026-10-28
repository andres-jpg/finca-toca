import { z } from "zod";
import { diferenciaPesos, tieneMaxDecimales } from "../lib/compra";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta.
// Mismos límites que la base: `peso_recibido_kg` y los bultos son `numeric(10,3)` (kg, 3 decimales),
// `precio_compra_kg` es `numeric(12,2)` (pesos, 2 decimales) y un lote admite de 1 a 200 bultos. La RPC
// `cafe.registrar_compra` los vuelve a comprobar: esto es lo que el formulario ve antes de enviar.

export const MAX_BULTOS = 200;
const MAX_KG = 9_999_999;
const MAX_PRECIO = 9_999_999_999;

const numero = (mensaje: string) => z.number({ message: mensaje }).refine(Number.isFinite, { message: mensaje });

const pesoKg = (mensaje: string) =>
  numero(mensaje)
    .gt(0, "El peso debe ser mayor que cero")
    .max(MAX_KG, "El peso es demasiado grande")
    .refine((v) => tieneMaxDecimales(v, 3), "El peso admite hasta 3 decimales (gramos)");

/** Texto opcional: recortado y `null` si queda vacío. */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

/** `YYYY-MM-DD` que además es un día real del calendario (no 2026-02-31). */
const fecha = z
  .string({ message: "Indica la fecha" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida")
  .refine((v) => {
    const [a, m, d] = v.split("-").map(Number);
    const f = new Date(Date.UTC(a, m - 1, d));
    return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
  }, "La fecha no es válida");

export const compraSchema = z
  .object({
    tipoCafeId: z.uuid({ message: "Elige el tipo de café" }),
    terceroId: z.uuid({ message: "Elige el proveedor" }),
    /** `YYYY-MM-DD` en la zona del cliente. */
    fecha,
    pesoKg: pesoKg("Indica el peso total en kilos"),
    numBultos: numero("Indica el número de bultos")
      .int("El número de bultos debe ser un entero")
      .min(1, "Debe haber al menos 1 bulto")
      .max(MAX_BULTOS, `Máximo ${MAX_BULTOS} bultos`),
    /** `null` = partes iguales (lo reparte la base). Si viene, debe tener `numBultos` pesos que sumen `pesoKg`. */
    pesosBultos: z
      .array(pesoKg("Cada bulto necesita un peso"), { message: "Los pesos por bulto no son válidos" })
      .nullish()
      .transform((v) => v ?? null),
    precioKg: numero("Indica el precio por kilo")
      .min(0, "El precio no puede ser negativo")
      .max(MAX_PRECIO, "El precio es demasiado grande")
      .refine((v) => tieneMaxDecimales(v, 2), "El precio admite hasta 2 decimales"),
    facturaProveedor: textoOpcional(60),
    observaciones: textoOpcional(500),
  })
  .superRefine((v, ctx) => {
    if (!v.pesosBultos) return;
    if (v.pesosBultos.length !== v.numBultos) {
      ctx.addIssue({
        code: "custom",
        path: ["pesosBultos"],
        message: `Hay ${v.pesosBultos.length} pesos por bulto y ${v.numBultos} bultos`,
      });
    } else if (diferenciaPesos(v.pesosBultos, v.pesoKg) !== 0) {
      ctx.addIssue({ code: "custom", path: ["pesosBultos"], message: "Los pesos por bulto no suman el peso total" });
    }
  });

export type CompraFormInput = z.input<typeof compraSchema>;
export type CompraValues = z.output<typeof compraSchema>;

/** Argumento `p` de `cafe.registrar_compra(p jsonb)`: nombres de la RPC (snake_case). */
export function aPayloadCompra(v: CompraValues) {
  return {
    tercero_id: v.terceroId,
    tipo_cafe_id: v.tipoCafeId,
    fecha: v.fecha,
    peso_kg: v.pesoKg,
    num_bultos: v.numBultos,
    pesos_bultos: v.pesosBultos,
    precio_kg: v.precioKg,
    factura_proveedor: v.facturaProveedor,
    observaciones: v.observaciones,
  };
}

/** Lo que devuelve la RPC al registrar la compra. */
export interface CompraRegistrada {
  id: string;
  codigo: string;
  valor_compra: number;
}
