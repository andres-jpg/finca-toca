// ===== CONCEPTOS DE GASTO =====
export interface SubconceptoGasto {
  id: number;
  concepto_id: number;
  nombre: string;
}

export interface ConceptoGasto {
  id: number;
  nombre: string;
  subconceptos: SubconceptoGasto[];
}

// ===== GASTOS =====
export interface Gasto {
  id: number;
  fecha: string;
  subconcepto_id: number | null;
  concepto: string;
  subconcepto: string | null;
  valor: number;
  numero_factura: string | null;
  pagado: boolean;
  observaciones: string | null;
}

// ===== CONCEPTOS DE INGRESO =====
export interface SubconceptoIngreso {
  id: number;
  concepto_id: number;
  nombre: string;
}

export interface ConceptoIngreso {
  id: number;
  nombre: string;
  subconceptos: SubconceptoIngreso[];
}

// ===== INGRESOS =====
export interface Ingreso {
  id: number;
  fecha: string;
  subconcepto_id: number;
  concepto: string;
  subconcepto: string;
  valor: number;
  observaciones: string | null;
}

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

// ===== VACAS =====
export type VacaOrigen = "finca" | "externa";
export type VacaEstado = "produccion" | "secado" | "pre_jardin" | "jardin";

export interface Vaca {
  id: string;
  created_at: string | null;
  vaca_id: number;
  nombre: string;
  origen: VacaOrigen | null;
  estado: VacaEstado | null;
  fecha_compra: string | null;
  numero_registro: string | null;
  madre_id: string | null;
  madre_nombre: string | null;
}

// ===== ROLES DE USUARIO =====
export type UserRole = "admin" | "user" | "viewer";

export interface UserWithRole {
  id: string;
  email: string;
  role: UserRole;
}
