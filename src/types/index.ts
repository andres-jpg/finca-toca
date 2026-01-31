export interface Milking {
  id: number;
  liters: number;
  date: string;
  observations: string | null;
  created_at: string;
}

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

export interface MilkingFormData {
  liters: number;
  date: Date;
  observations?: string;
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
