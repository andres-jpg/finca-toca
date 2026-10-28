import { z } from "zod";
import type { ParametroDef } from "@/modules/core/parametros/registry";
import type { ConceptoTarifaDef } from "@/modules/core/tarifas/registry";

// Definiciones (solo definiciones: el vertical aún no tiene pantallas) de los valores que el cliente de café
// debe poder cambiar sin código. Las agrega `src/modules/registry.ts`; el núcleo no importa este fichero.
// Los valores guardados viven en `public.parametros`; si faltan o no cumplen el schema, rige `defecto`.

const positivo = (mensaje: string) =>
  z.number({ message: mensaje }).refine(Number.isFinite, { message: mensaje }).gt(0, mensaje);

const porcentaje = (mensaje: string) =>
  z.number({ message: mensaje }).refine(Number.isFinite, { message: mensaje }).min(0, mensaje).max(100, mensaje);

/**
 * Rango `{ min, max }` o `null` ("sin configurar": aún no lo ha confirmado el cliente). Los dos extremos
 * llegan juntos o ninguno: un `{ min: 10 }` a medias no es un rango.
 */
const rangoOpcional = (mensaje: string) =>
  z
    .object(
      {
        min: z.number({ message: mensaje }).refine(Number.isFinite, { message: mensaje }),
        max: z.number({ message: mensaje }).refine(Number.isFinite, { message: mensaje }),
      },
      { message: mensaje },
    )
    .refine((r) => r.min < r.max, { message: "El mínimo debe ser menor que el máximo" })
    .nullable();

export interface Rango {
  min: number;
  max: number;
}

export const PARAMETROS_CAFE = {
  capacidadTostadoraKg: {
    clave: "cafe.capacidad_tostadora_kg",
    modulo: "cafe.procesos",
    etiqueta: "Capacidad de la tostadora",
    ayuda: "Kilos de café verde que admite un bache de tostión.",
    schema: positivo("La capacidad debe ser mayor que cero"),
    defecto: 13.5,
    grupo: "Producción",
    tipo: "numero",
    unidad: "kg",
  } satisfies ParametroDef<number>,
  mermaReferenciaTrillaPct: {
    clave: "cafe.merma_referencia_trilla_pct",
    modulo: "cafe.procesos",
    etiqueta: "Merma de referencia en trilla",
    ayuda: "Porcentaje de pérdida esperado al trillar (pergamino → excelso).",
    schema: porcentaje("Debe estar entre 0 y 100"),
    defecto: 19,
    grupo: "Mermas",
    tipo: "numero",
    unidad: "%",
  } satisfies ParametroDef<number>,
  mermaReferenciaTostionPct: {
    clave: "cafe.merma_referencia_tostion_pct",
    modulo: "cafe.procesos",
    etiqueta: "Merma de referencia en tostión",
    ayuda: "Porcentaje de pérdida esperado al tostar (verde → tostado).",
    schema: porcentaje("Debe estar entre 0 y 100"),
    defecto: 18,
    grupo: "Mermas",
    tipo: "numero",
    unidad: "%",
  } satisfies ParametroDef<number>,
  mermaToleranciaPts: {
    clave: "cafe.merma_tolerancia_pts",
    modulo: "cafe.procesos",
    etiqueta: "Tolerancia de la merma",
    ayuda: "Puntos porcentuales de diferencia con la referencia antes de avisar. Valor provisional: pendiente de confirmar con Cofradía.",
    schema: z.number({ message: "La tolerancia debe ser un número" }).refine(Number.isFinite, { message: "La tolerancia debe ser un número" }).min(0, "No puede ser negativa"),
    defecto: 3,
    grupo: "Mermas",
    tipo: "numero",
    unidad: "pts",
  } satisfies ParametroDef<number>,
  humedadRangoPct: {
    clave: "cafe.humedad_rango_pct",
    modulo: "cafe.recepcion",
    etiqueta: "Rango de humedad aceptable",
    ayuda: "Humedad mínima y máxima (%) del café en la recepción. Pendiente de confirmar con Cofradía.",
    schema: rangoOpcional("Indica el mínimo y el máximo"),
    defecto: null as Rango | null,
    grupo: "Calidad",
    tipo: "rango",
    unidad: "%",
  } satisfies ParametroDef<Rango | null>,
  densidadRango: {
    clave: "cafe.densidad_rango",
    modulo: "cafe.recepcion",
    etiqueta: "Rango de densidad aceptable",
    ayuda: "Densidad mínima y máxima del café en la recepción. Pendiente de confirmar con Cofradía.",
    schema: rangoOpcional("Indica el mínimo y el máximo"),
    defecto: null as Rango | null,
    grupo: "Calidad",
    tipo: "rango",
  } satisfies ParametroDef<Rango | null>,
  pesoBultoKg: {
    clave: "cafe.peso_bulto_kg",
    modulo: "cafe.recepcion",
    etiqueta: "Peso de un bulto",
    ayuda: "Kilos por bulto, para convertir bultos a kilos en la recepción.",
    schema: positivo("El peso debe ser mayor que cero"),
    defecto: 62.5,
    grupo: "Recepción",
    tipo: "numero",
    unidad: "kg",
  } satisfies ParametroDef<number>,
} as const;

/** Todas las definiciones de café, para `defineParametros()`. */
export const DEFINICIONES_PARAMETROS_CAFE: readonly ParametroDef<unknown>[] = Object.values(PARAMETROS_CAFE);

/**
 * Conceptos cobrables con tarifa (HU-F1-09). El empaque no tiene tarifa a propósito: no es un concepto.
 * Los valores concretos (trilla $1.400, tostión $2.200, molienda $1.000) los siembra el alta del cliente
 * (FIN-98) en `public.tarifas`; aquí solo se declara qué conceptos existen.
 */
export const CONCEPTOS_TARIFA_CAFE: readonly ConceptoTarifaDef[] = [
  { concepto: "cafe.trilla", modulo: "cafe.procesos", etiqueta: "Trilla", ayuda: "Por kilo de pergamino trillado.", unidad: "kg" },
  { concepto: "cafe.tostion", modulo: "cafe.procesos", etiqueta: "Tostión", ayuda: "Por kilo de café verde tostado.", unidad: "kg" },
  { concepto: "cafe.molienda", modulo: "cafe.procesos", etiqueta: "Molienda", ayuda: "Por kilo de café molido.", unidad: "kg" },
];
