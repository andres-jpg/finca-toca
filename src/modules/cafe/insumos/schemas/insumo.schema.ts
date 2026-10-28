import { z } from "zod";
import { normalizarNombre } from "@/modules/core/terceros/lib/normalizar";
import { CLASES_INSUMO, PRESENTACION_MAX_G, PRESENTACION_MIN_G } from "../lib/insumos";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta.
// Bolsas y etiquetas son unidades sueltas: las cantidades son enteras. Los esquemas normalizan (trim +
// espacios colapsados) y son idempotentes, así que el Server Action puede re-validar lo que el formulario ya validó.

const nombre = z
  .string({ message: "El nombre es obligatorio" })
  .transform(normalizarNombre)
  .pipe(
    z
      .string()
      .min(2, "El nombre debe tener al menos 2 caracteres")
      .max(120, "El nombre: máximo 120 caracteres"),
  );

/** Mínimo opcional: vacío = sin alerta (`null`), distinto de 0. Entero porque el stock se cuenta en unidades. */
const stockMinimo = z
  .number({ message: "El mínimo debe ser un número" })
  .int("El mínimo debe ser un número entero")
  .min(0, "El mínimo no puede ser negativo")
  .max(10_000_000, "El mínimo es demasiado grande")
  .nullish()
  .transform((v) => v ?? null);

const articuloId = z.uuid({ message: "Elige un insumo" });

const observaciones = z
  .string()
  .trim()
  .max(500, "Máximo 500 caracteres")
  .nullish()
  .transform((v) => (v ? v : null));

// --- Insumo (maestro) ---------------------------------------------------------------------------------

export const insumoSchema = z.object({
  nombre,
  clase: z.enum(CLASES_INSUMO, { message: "Elige si es bolsa o etiqueta" }),
  presentacion_g: z
    .number({ message: "Indica el peso de la presentación" })
    .int("El peso debe ser un número entero de gramos")
    .min(PRESENTACION_MIN_G, `El peso mínimo es ${PRESENTACION_MIN_G} g`)
    .max(PRESENTACION_MAX_G, `El peso máximo es ${PRESENTACION_MAX_G.toLocaleString("es-CO")} g`),
  stock_minimo: stockMinimo,
});

/** Editar un insumo: solo nombre y mínimo. Clase y presentación no cambian (definen sus productos terminados). */
export const editarInsumoSchema = z.object({ nombre, stock_minimo: stockMinimo });

export type InsumoFormInput = z.input<typeof insumoSchema>;
export type InsumoValues = z.output<typeof insumoSchema>;
export type EditarInsumoFormInput = z.input<typeof editarInsumoSchema>;
export type EditarInsumoValues = z.output<typeof editarInsumoSchema>;

// --- Compra ---------------------------------------------------------------------------------------------

export const compraInsumoSchema = z.object({
  articuloId,
  cantidad: z
    .number({ message: "Indica la cantidad" })
    .int("La cantidad debe ser un número entero")
    .gt(0, "La cantidad debe ser mayor a 0")
    .max(10_000_000, "La cantidad es demasiado grande"),
  costoUnitario: z
    .number({ message: "El costo debe ser un número" })
    .min(0, "El costo no puede ser negativo")
    .max(1_000_000_000, "El costo es demasiado grande")
    .nullish()
    .transform((v) => v ?? null),
  terceroId: z.uuid({ message: "El proveedor no es válido" }).nullish().transform((v) => v ?? null),
  /** `YYYY-MM-DD` en la zona del cliente. */
  fecha: z.string({ message: "Indica la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
  observaciones,
});

export type CompraInsumoFormInput = z.input<typeof compraInsumoSchema>;
export type CompraInsumoValues = z.output<typeof compraInsumoSchema>;

// --- Ajuste ---------------------------------------------------------------------------------------------

/** Corrección de stock: la cantidad lleva signo (+ aumenta, − disminuye) y la observación es obligatoria. */
export const ajusteInsumoSchema = z.object({
  articuloId,
  cantidad: z
    .number({ message: "Indica la cantidad" })
    .int("La cantidad debe ser un número entero")
    .refine((n) => n !== 0, { message: "La cantidad no puede ser cero" })
    .refine((n) => Math.abs(n) <= 10_000_000, { message: "La cantidad es demasiado grande" }),
  observaciones: z
    .string({ message: "Explica el ajuste" })
    .trim()
    .min(3, "Un ajuste exige una observación que lo explique")
    .max(500, "Máximo 500 caracteres"),
});

export type AjusteInsumoFormInput = z.input<typeof ajusteInsumoSchema>;
export type AjusteInsumoValues = z.output<typeof ajusteInsumoSchema>;

/**
 * Lo que escribe el formulario de ajuste: una cantidad positiva y si aumenta o disminuye (un teclado numérico
 * de tablet no tiene signo menos). `cantidadAjuste()` la convierte a la cantidad con signo que espera la acción.
 */
export const ajusteFormSchema = z.object({
  direccion: z.enum(["aumenta", "disminuye"], { message: "Indica si el ajuste aumenta o disminuye el stock" }),
  cantidad: z
    .number({ message: "Indica la cantidad" })
    .int("La cantidad debe ser un número entero")
    .gt(0, "La cantidad debe ser mayor a 0")
    .max(10_000_000, "La cantidad es demasiado grande"),
  observaciones: ajusteInsumoSchema.shape.observaciones,
});

export type AjusteFormInput = z.input<typeof ajusteFormSchema>;
export type AjusteFormValues = z.output<typeof ajusteFormSchema>;

export function cantidadAjuste(values: Pick<AjusteFormValues, "direccion" | "cantidad">): number {
  return values.direccion === "disminuye" ? -values.cantidad : values.cantidad;
}
