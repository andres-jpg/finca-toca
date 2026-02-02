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

// ===== EXTRACCIONES DE LECHE =====
export interface ExtraccionLeche {
  id: number;
  created_at: string;
  fecha: string;
  litros: number;
}

export interface ExtraccionLecheFormData {
  fecha: Date;
  litros: number;
}

// ===== ROLES DE USUARIO =====
export type UserRole = "admin" | "user" | "viewer";

export interface UserWithRole {
  id: string;
  email: string;
  role: UserRole;
}
