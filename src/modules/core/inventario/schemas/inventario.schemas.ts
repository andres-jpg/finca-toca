import { z } from "zod";
import {
  MOTIVOS,
  TIPOS_ARTICULO,
  UNIDADES,
  cantidadConSigno,
  signoMotivo,
  signoValido,
} from "../lib/inventario";

// `message` en vez de `required_error`/`invalid_type_error`: Zod 4 ya no los acepta.

/** Texto opcional: en blanco equivale a "sin valor" (`null`), como una columna sin definir. */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

const cantidadStock = (mensaje: string) =>
  z.number({ message: mensaje }).refine(Number.isFinite, { message: mensaje });

/** Atributos del artículo (p. ej. `{"clase":"bolsa","presentacion_g":500}`): objeto plano de texto, número o booleano. */
export const atributosSchema = z.record(
  z.string().min(1, "El nombre del atributo no puede estar vacío"),
  z.union([z.string(), z.number(), z.boolean()]),
  { message: "Los atributos deben ser un objeto" },
);

const stockMinimoSchema = cantidadStock("El stock mínimo debe ser un número")
  .min(0, "El stock mínimo no puede ser negativo")
  .nullish()
  .transform((v) => v ?? null);

// --- Artículos --------------------------------------------------------------------------------------

export const crearArticuloSchema = z.object({
  codigo: textoOpcional(40),
  nombre: z.string({ message: "El nombre es obligatorio" }).trim().min(1, "El nombre es obligatorio").max(120, "Máximo 120 caracteres"),
  tipo: z.enum(TIPOS_ARTICULO, { message: "Elige el tipo de artículo" }),
  unidad: z.enum(UNIDADES, { message: "Elige la unidad" }),
  atributos: atributosSchema,
  stock_minimo: stockMinimoSchema,
});

/**
 * Lo que se puede cambiar de un artículo. `tipo` y `unidad` NO están: la base los bloquea una vez
 * creado (los movimientos existentes perderían su sentido). Todo opcional: solo se envía lo que cambia.
 */
export const actualizarArticuloSchema = z
  .object({
    codigo: textoOpcional(40),
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120, "Máximo 120 caracteres"),
    atributos: atributosSchema,
    stock_minimo: stockMinimoSchema,
    activo: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que guardar" });

export type CrearArticuloInput = z.input<typeof crearArticuloSchema>;
export type CrearArticuloValues = z.output<typeof crearArticuloSchema>;
export type ActualizarArticuloInput = z.input<typeof actualizarArticuloSchema>;
export type ActualizarArticuloValues = z.output<typeof actualizarArticuloSchema>;

// --- Movimientos ------------------------------------------------------------------------------------

const motivoSchema = z.enum(MOTIVOS, { message: "El motivo es obligatorio" });

/** Un movimiento tal como lo recibe la RPC: la cantidad lleva signo (+ entrada, − salida). */
export const movimientoSchema = z
  .object({
    articulo_id: z.uuid({ message: "Elige un artículo" }),
    cantidad: cantidadStock("Indica la cantidad").refine((n) => n !== 0, { message: "La cantidad no puede ser cero" }),
    motivo: motivoSchema,
    fecha: z.date({ message: "La fecha no es válida" }).optional(),
    costo_unitario: z.number({ message: "El costo debe ser un número" }).min(0, "El costo no puede ser negativo").nullish(),
    ref_tipo: textoOpcional(60),
    ref_id: z.uuid({ message: "La referencia no es válida" }).nullish(),
    observaciones: textoOpcional(500),
  })
  .superRefine((m, ctx) => {
    // Mismas reglas que la base (CHECK + RPC), para avisar en el formulario en vez de devolver un error crudo.
    if (!signoValido(m.motivo, m.cantidad)) {
      ctx.addIssue({
        code: "custom",
        path: ["cantidad"],
        message: signoMotivo(m.motivo) > 0
          ? "Este motivo es una entrada: la cantidad debe ser positiva"
          : "Este motivo es una salida: la cantidad debe ser negativa",
      });
    }
    if (m.motivo === "ajuste" && !m.observaciones) {
      ctx.addIssue({
        code: "custom",
        path: ["observaciones"],
        message: "Un ajuste exige una observación que lo explique",
      });
    }
  });

export const registrarMovimientosSchema = z.object({
  movimientos: z.array(movimientoSchema).min(1, "Indica al menos un movimiento").max(100, "Máximo 100 movimientos por operación"),
  /** `true` para ventas: se registra aunque falte stock y se avisa. */
  permitirNegativo: z.boolean().default(false),
});

export type MovimientoInput = z.input<typeof movimientoSchema>;
export type MovimientoValues = z.output<typeof movimientoSchema>;
export type RegistrarMovimientosInput = z.input<typeof registrarMovimientosSchema>;

/**
 * Formulario de un solo movimiento: el usuario escribe una cantidad positiva y el motivo decide el
 * signo (en un `ajuste`, `direccion`). `aMovimiento()` lo convierte al formato de la RPC.
 */
export const movimientoFormSchema = z
  .object({
    articulo_id: z.uuid({ message: "Elige un artículo" }),
    motivo: motivoSchema,
    cantidad: cantidadStock("Indica la cantidad").refine((n) => n > 0, { message: "La cantidad debe ser mayor a 0" }),
    direccion: z.enum(["entrada", "salida"]).optional(),
    costo_unitario: z.number({ message: "El costo debe ser un número" }).min(0, "El costo no puede ser negativo").nullish(),
    observaciones: textoOpcional(500),
  })
  .superRefine((m, ctx) => {
    if (m.motivo === "ajuste" && !m.direccion) {
      ctx.addIssue({ code: "custom", path: ["direccion"], message: "Indica si el ajuste aumenta o disminuye el stock" });
    }
    if (m.motivo === "ajuste" && !m.observaciones) {
      ctx.addIssue({ code: "custom", path: ["observaciones"], message: "Un ajuste exige una observación que lo explique" });
    }
  });

export type MovimientoFormInput = z.input<typeof movimientoFormSchema>;
export type MovimientoFormValues = z.output<typeof movimientoFormSchema>;

export function aMovimiento(values: MovimientoFormValues): MovimientoInput {
  return {
    articulo_id: values.articulo_id,
    motivo: values.motivo,
    cantidad: cantidadConSigno(values.motivo, values.cantidad, values.direccion),
    costo_unitario: values.costo_unitario ?? null,
    observaciones: values.observaciones,
  };
}
