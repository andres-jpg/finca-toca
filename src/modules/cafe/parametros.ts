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

/** Nivel de tueste → su parámetro de merma de referencia (A-03). */
export const CLAVES_MERMA_TOSTION = ["bajo", "medio", "alto"] as const;

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
  mermaReferenciaTostionBajoPct: {
    clave: "cafe.merma_referencia_tostion_bajo_pct",
    modulo: "cafe.procesos",
    etiqueta: "Merma de referencia en tostión · tueste bajo",
    ayuda: "Porcentaje de pérdida esperado al tostar a nivel bajo (verde → tostado). Un cambio aplica solo a los procesos que se registren después.",
    schema: porcentaje("Debe estar entre 0 y 100"),
    defecto: 18,
    grupo: "Mermas",
    tipo: "numero",
    unidad: "%",
  } satisfies ParametroDef<number>,
  mermaReferenciaTostionMedioPct: {
    clave: "cafe.merma_referencia_tostion_medio_pct",
    modulo: "cafe.procesos",
    etiqueta: "Merma de referencia en tostión · tueste medio",
    ayuda: "Porcentaje de pérdida esperado al tostar a nivel medio (verde → tostado). Un cambio aplica solo a los procesos que se registren después.",
    schema: porcentaje("Debe estar entre 0 y 100"),
    defecto: 18,
    grupo: "Mermas",
    tipo: "numero",
    unidad: "%",
  } satisfies ParametroDef<number>,
  mermaReferenciaTostionAltoPct: {
    clave: "cafe.merma_referencia_tostion_alto_pct",
    modulo: "cafe.procesos",
    etiqueta: "Merma de referencia en tostión · tueste alto",
    ayuda: "Porcentaje de pérdida esperado al tostar a nivel alto (verde → tostado). Un cambio aplica solo a los procesos que se registren después.",
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
    ayuda: "Puntos porcentuales de diferencia con la referencia, por encima o por debajo, antes de avisar. Valor provisional: pendiente de confirmar con Cofradía.",
    schema: z.number({ message: "La tolerancia debe ser un número" }).refine(Number.isFinite, { message: "La tolerancia debe ser un número" }).min(0, "No puede ser negativa"),
    defecto: 2,
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
  diasSinRecoger: {
    clave: "cafe.dias_sin_recoger",
    modulo: "cafe.procesos",
    etiqueta: "Días para avisar de un lote sin recoger",
    ayuda: "Un lote de servicio listo para entregar que lleva más de estos días en planta sale en el aviso del tablero de Planta.",
    schema: z.number({ message: "Los días deben ser un número entero" }).int("Los días deben ser un número entero").min(1, "Debe ser al menos 1 día").max(365, "No puede pasar de 365 días"),
    defecto: 7,
    grupo: "Planta",
    tipo: "numero",
    unidad: "días",
  } satisfies ParametroDef<number>,
  coberturaMinimaDias: {
    clave: "cafe.cobertura_minima_dias",
    modulo: "cafe.inventario",
    etiqueta: "Cobertura mínima del producto terminado",
    ayuda: "Si el producto terminado alcanza para menos de estos días de venta (promedio de los últimos 30 días), el Inventario lo marca en rojo.",
    schema: z.number({ message: "Los días deben ser un número entero" }).int("Los días deben ser un número entero").min(1, "Debe ser al menos 1 día").max(365, "No puede pasar de 365 días"),
    defecto: 10,
    grupo: "Inventario",
    tipo: "numero",
    unidad: "días",
  } satisfies ParametroDef<number>,
  promedioVentasLbMes: {
    clave: "cafe.promedio_ventas_lb_mes",
    modulo: "cafe.dashboard",
    etiqueta: "Promedio mensual de libras vendidas",
    ayuda: "Referencia del Panel para «Libras vendidas»: cuántas libras se venden en un mes promedio. No es una meta.",
    schema: positivo("El promedio debe ser mayor que cero"),
    defecto: 2850,
    grupo: "Panel",
    tipo: "numero",
    unidad: "lb",
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
