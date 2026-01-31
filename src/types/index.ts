export interface Gasto {
  id: number;
  fecha: string;
  concepto: string;
  valor: number;
  observaciones: string | null;
}

export interface Ingreso {
  id: number;
  fecha: string;
  concepto: string;
  valor: number;
  observaciones: string | null;
}

export interface GastoFormData {
  fecha: Date;
  concepto: string;
  valor: number;
  observaciones?: string;
}

export interface IngresoFormData {
  fecha: Date;
  concepto: string;
  valor: number;
  observaciones?: string;
}

export const GASTO_OPTIONS = [
  "Veterinario",
  "Concentrado",
  "Sal",
  "Medicamentos",
  "Combustible",
  "Transporte",
  "Salario",
  "Arriendo",
  "Limpieza",
  "Otros",
] as const;

export const INGRESO_OPTIONS = [
  "Leche",
  "Venta terneros",
  "Venta vacas",
] as const;

export type GastoOption = (typeof GASTO_OPTIONS)[number];
export type IngresoOption = (typeof INGRESO_OPTIONS)[number];
