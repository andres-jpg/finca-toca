import { z } from "zod";
import type { ParametroDef } from "../parametros/registry";
import { ANCHOS_IMPRESORA, type AnchoImpresora } from "./lib/ancho";

/**
 * Ancho del rollo de la impresora térmica de tiquetes, en mm (58 u 80). Lo lee el layout `(print)` con
 * `getParametro()`; lo agrega `src/modules/registry.ts`.
 *
 * Va bajo `core.terceros` porque el catálogo de módulos no tiene uno de impresión y crear uno exige
 * migración: es el mismo módulo del que cuelga la pantalla de Tarifas y parámetros, que es donde se edita,
 * así que solo se ofrece a los clientes que ya la ven.
 */
export const PARAMETRO_IMPRESORA_ANCHO = {
  clave: "core.impresora_ancho_mm",
  modulo: "core.terceros",
  etiqueta: "Ancho del rollo de la impresora",
  ayuda: "Ancho del papel térmico de los tiquetes: 58 u 80 mm.",
  schema: z.union([z.literal(58), z.literal(80)], { message: `Debe ser ${ANCHOS_IMPRESORA.join(" u ")}` }),
  defecto: 80 as AnchoImpresora,
  grupo: "Impresión",
  tipo: "numero",
  unidad: "mm",
} satisfies ParametroDef<AnchoImpresora>;
