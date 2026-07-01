import type { Database } from "@/lib/supabase/database.types";

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
export interface Pago {
  forma_pago: "efectivo" | "transferencia";
  tipo_cuenta: string | null;
  banco: string | null;
  numero_cuenta: string | null;
}

export interface Gasto {
  id: number;
  fecha: string;
  subconcepto_id: number | null;
  concepto: string;
  subconcepto: string | null;
  valor: number;
  proveedor: string | null;
  numero_factura: string | null;
  pagado: boolean;
  observaciones: string | null;
  pago: Pago | null;
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
  source: string | null;
}

// ===== PRECIOS =====
export interface Precio {
  id: number;
  created_at: string;
  valor: number;
  tipo: string;
}

// ===== EXTRACCIONES DE LECHE =====
export interface ExtraccionLeche {
  id: number;
  created_at: string;
  fecha: string;
  litros: number;
  vacas_en_produccion: number | null;
}

export interface ExtraccionLecheFormData {
  fecha: Date;
  litros: number;
}

// ===== VACAS =====
export type VacaOrigen = "finca" | "externa";
export type VacaEstado = "produccion" | "secado" | "pre_jardin" | "jardin" | "transicion";

export interface Vaca {
  id: string;
  created_at: string | null;
  vaca_id: string;
  nombre: string;
  origen: VacaOrigen | null;
  estado: VacaEstado | null;
  fecha_compra: string | null;
  fecha_nacimiento: string | null;
  numero_registro: string | null;
  madre_id: string | null;
  madre_nombre: string | null;
  padre_id: string | null;
  padre_nombre: string | null;
  padre_pajilla_nombre: string | null;
  alta: boolean;
}

// ===== TOROS =====
export type ToroEstado = "jardin" | "reproductor";

export interface Toro {
  id: string;
  created_at: string | null;
  toro_id: number;
  nombre: string;
  origen: VacaOrigen | null;
  estado: ToroEstado | null;
  fecha_compra: string | null;
  fecha_nacimiento: string | null;
  numero_registro: string | null;
  madre_id: string | null;
  madre_nombre: string | null;
  padre_id: string | null;
  padre_nombre: string | null;
  alta: boolean;
}

// ===== EVENTOS ANIMAL =====
export type TipoEvento =
  | "vacunacion"
  | "vitaminacion"
  | "medicamento"
  | "enfermedad"
  | "celo"
  | "inseminacion"
  | "palpacion"
  | "confirmacion_prenez"
  | "parto"
  | "observacion";

export interface EventoAnimal {
  id: string;
  created_at: string;
  animal_id: string;
  animal_tipo: "vaca" | "toro";
  tipo_evento: TipoEvento;
  fecha: string;
  descripcion: string | null;
  responsable: string | null;
}

// ===== FICHAS (detalle) =====
export interface CriaAnimal {
  id: string;
  tipo: "vaca" | "toro";
  animal_id: string | number;
  nombre: string;
  estado: string | null;
  alta: boolean;
}

export interface VacaDetalle extends Vaca {
  padre: { id: string; toro_id: number; nombre: string } | null;
  madre: { id: string; vaca_id: string; nombre: string } | null;
  crias: CriaAnimal[];
}

export interface ToroDetalle extends Toro {
  padre: { id: string; toro_id: number; nombre: string } | null;
  madre: { id: string; vaca_id: string; nombre: string } | null;
  crias: CriaAnimal[];
}

// ===== INVENTARIO: PAJILLAS =====
export interface Pajilla {
  id: string;
  created_at: string;
  toro_nombre: string;
  toro_ref_id: string;
  fecha_compra: string;
  cantidad: number;
  cantidad_disponible: number;
  observaciones: string | null;
}

export interface PajillaPorToro {
  toro_nombre: string;
  toro_ref_id: string;
  total_disponible: number;
  total_inicial: number;
}

// ===== ROLES DE USUARIO =====
export type UserRole = Database["public"]["Enums"]["rol"];

export interface UserWithRole {
  id: string;
  email: string;
  role: UserRole;
}

// ===== COOPERATIVA =====
export interface UserCooperativa {
  id: string;
  email: string;
  itinerario_id: number | null;
  itinerario_nombre: string | null;
}

export interface ItinerarioFinca {
  id: number;
  nombre: string;
  precio_litro: number;
  activa: boolean;
  created_at: string;
  ruta_nombre: string | null;
  orden: number;
}

export interface Itinerario {
  id: number;
  nombre: string;
  fincas: ItinerarioFinca[];
  conductores: string[];
}

export interface FincaCooperativa {
  id: number;
  nombre: string;
  precio_litro: number;
  activa: boolean;
  created_at: string;
  ruta_nombre: string | null;
  orden?: number;
  metodo_pago: 'conductor' | 'punto_venta' | 'gerente';
}

export type EstadoPago = 'pendiente' | 'pagado' | 'punto_venta' | 'devuelto';
export type ResponsablePago = 'conductor' | 'punto_venta' | 'gerente';

export interface PagoFinca {
  id: number;
  finca_id: number;
  finca_nombre: string;
  itinerario_id: number | null;
  itinerario_nombre: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  litros: number;
  estado: EstadoPago;
  responsable: ResponsablePago;
  fecha_marcado: string | null;
  activado_por: string | null;
  marcado_por: string | null;
  created_at: string;
}

export interface RutaCooperativa {
  id: number;
  nombre: string;
  created_at: string;
  fincas: FincaCooperativa[];
}

export interface Recoleccion {
  id: number;
  finca_id: number;
  finca_nombre: string;
  ruta_nombre: string | null;
  fecha: string;
  litros: number;
  precio_litro: number;
  valor_total: number;
  created_at: string;
}
