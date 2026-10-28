"use server";

// Carga el registro de módulos: ahí se inyectan al núcleo las definiciones de parámetros y conceptos de tarifa
// de cada vertical. Tiene que estar en ESTE módulo (no basta con que lo importe el layout): el registro es
// estado de módulo y las funciones del núcleo que lo leen deben compartir bundle con él.
import "@/modules/registry";
import { guardarParametro as guardarParametroNucleo } from "@/modules/core/parametros/actions/parametros.service";
import { crearTarifa as crearTarifaNucleo, eliminarTarifaProgramada } from "@/modules/core/tarifas/actions/tarifas.service";
import type { CrearTarifaInput } from "@/modules/core/tarifas/schemas/tarifas.schemas";

// Server Actions de "Tarifas y parámetros". Cada una autoriza dentro (owner/admin + módulo): esto es un
// endpoint POST público, no basta con esconder la pantalla.

export async function guardarParametro(clave: string, valor: unknown) {
  return guardarParametroNucleo(clave, valor);
}

export async function crearTarifa(input: CrearTarifaInput) {
  return crearTarifaNucleo(input);
}

export async function eliminarTarifa(id: string) {
  return eliminarTarifaProgramada(id);
}
