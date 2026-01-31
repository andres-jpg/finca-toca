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

export const CONCEPTO_OPTIONS = [
  "Alimentación",
  "Veterinario",
  "Transporte",
  "Mantenimiento",
  "Servicios",
  "Otros",
] as const;

export type ConceptoOption = (typeof CONCEPTO_OPTIONS)[number];
