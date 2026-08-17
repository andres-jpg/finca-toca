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
  /** NULL = manual; 'leche_cria' y 'arriendo_abono' = generado por otro módulo. */
  source: string | null;
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
  /** Leche que se vende: genera el ingreso automático (`ingresos.source = 'leche_extraccion'`). */
  litros_cantina: number;
  /** Leche que se queda para las crías: genera el gasto automático (`gastos.source = 'leche_cria'`). */
  litros_cria: number;
  vacas_en_produccion: number | null;
}

/** Total extraído del día: es lo que mide la productividad por vaca, no solo lo vendido. */
export function litrosTotales(e: Pick<ExtraccionLeche, "litros_cantina" | "litros_cria">): number {
  return e.litros_cantina + e.litros_cria;
}

export interface ExtraccionLecheFormData {
  fecha: Date;
  litros_cantina: number;
  litros_cria: number;
}

// ===== ANIMALES =====
export type VacaOrigen = "finca" | "externa";
export type AnimalSexo = "hembra" | "macho";
export type AnimalRaza = "holstein" | "jersey" | "jerhol" | "normando" | "ayrshire" | "cruce";

/** Ciclo productivo: leche → levante_1 → levante_2 → produccion ⇄ secado (machos: … → reproductor). */
export type EstadoProductivo = Database["public"]["Enums"]["estado_productivo"];
/** Ciclo reproductivo (solo hembras): pre_servicio → servicio → por_confirmar → cargada / rechequeo / servicio (una palpación "vacía" vuelve directo a servicio, ya no es un estado propio). */
export type EstadoReproductivo = Database["public"]["Enums"]["estado_reproductivo"];

export interface Animal {
  id: string;
  created_at: string | null;
  identificador: string;
  nombre: string;
  /** Solo diligenciado en el formulario de El Velero. */
  nombre_largo: string | null;
  sexo: AnimalSexo;
  raza: AnimalRaza | null;
  /** Composición racial en texto libre, ej. "AYR:88% x HOL:13%". Opcional, solo El Velero. */
  sangre: string | null;
  origen: VacaOrigen | null;
  estado_productivo: EstadoProductivo | null;
  estado_reproductivo: EstadoReproductivo | null;
  fecha_compra: string | null;
  fecha_nacimiento: string | null;
  numero_registro: string | null;
  madre_id: string | null;
  madre_nombre: string | null;
  /** Nombre libre de la madre cuando el animal es de origen externo y no está registrada. */
  madre_externa_nombre: string | null;
  padre_id: string | null;
  padre_nombre: string | null;
  padre_pajilla_nombre: string | null;
  /**
   * Nombre libre de un padre sin registro propio: toro de monta natural que no es de la
   * finca ni fue usado por pajilla (origen finca), o el padre de un animal de origen externo.
   */
  padre_alquiler_nombre: string | null;
  /** Raza del padre libre — no tiene un registro propio del que inferirla. */
  padre_alquiler_raza: AnimalRaza | null;
  /**
   * Concentrado que se le debe dar a la vaca en **cada ordeño** del día. Se mete a mano,
   * es informativo y no lo deriva ningún evento. `null` = sin definir (distinto de 0).
   */
  concentrado_por_ordeno: number | null;
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
  | "monta"
  | "palpacion"
  | "confirmacion_prenez"
  | "parto"
  | "aborto"
  | "secado"
  | "topizado"
  | "observacion";

/** Resultado de una palpación / confirmación de preñez. */
export type ResultadoPalpacion = "cargada" | "rechequeo" | "vacia";

/** Plazo hasta la siguiente vacuna. `personalizada` = el usuario escribe la fecha. */
export type PeriodoRevacunacion = "1_mes" | "6_meses" | "1_anio" | "personalizada";

export interface EventoAnimal {
  id: string;
  created_at: string;
  animal_id: string;
  animal_tipo: "vaca" | "toro";
  tipo_evento: TipoEvento;
  fecha: string;
  descripcion: string | null;
  responsable: string | null;
  resultado: ResultadoPalpacion | null;
  /** Inseminación: lote de pajillas utilizado (`pajillas.id`). Descuenta stock. */
  pajilla_id: string | null;
  /** Monta: toro que cubrió (`animales.id`). */
  toro_id: string | null;
  /** Vacunación: ¿hay que volver a vacunar? NULL en el resto de tipos. */
  requiere_revacunacion: boolean | null;
  /** Vacunación: plazo elegido. Se guarda para poder recalcular la fecha al editar. */
  periodo_revacunacion: PeriodoRevacunacion | null;
  /** Vacunación: fecha de la próxima vacuna; es la que dispara la alerta. */
  fecha_revacunacion: string | null;
}

// ===== ALERTAS =====
export type TipoAlerta = "parto" | "secado" | "topizado" | "celo" | "revacunacion";
export type SeveridadAlerta = "vencida" | "hoy" | "proxima";

export interface Alerta {
  /** Determinista (`${animal_id}:${tipo}`) — las alertas se derivan, no se guardan. */
  id: string;
  tipo: TipoAlerta;
  animal_id: string;
  animal_nombre: string;
  animal_identificador: string;
  /** ISO `YYYY-MM-DD`. */
  fecha_objetivo: string;
  /** Negativo = vencida. */
  dias_restantes: number;
  severidad: SeveridadAlerta;
  /** `true` para secado y topizado: se cierran con el botón "Marcar hecho". */
  resoluble: boolean;
  detalle: string;
}

// ===== FICHAS (detalle) =====
export interface CriaAnimal {
  id: string;
  sexo: AnimalSexo;
  identificador: string;
  nombre: string;
  estado_productivo: EstadoProductivo | null;
  estado_reproductivo: EstadoReproductivo | null;
  alta: boolean;
}

export interface AnimalDetalle extends Animal {
  padre: { id: string; identificador: string; nombre: string } | null;
  madre: { id: string; identificador: string; nombre: string } | null;
  crias: CriaAnimal[];
}

// ===== INVENTARIO: PAJILLAS =====
export interface Pajilla {
  id: string;
  created_at: string;
  toro_nombre: string;
  toro_ref_id: string;
  raza: AnimalRaza | null;
  proveedor: string | null;
  fecha_compra: string;
  cantidad: number;
  cantidad_disponible: number;
  observaciones: string | null;
}

export interface PajillaPorToro {
  /**
   * Identificador de la fila agrupada (`nombre||referencia`). Existe porque `toro_ref_id`
   * **no es único** —"NA" lo comparten varios toros—, así que no sirve como key de React.
   */
  clave: string;
  toro_nombre: string;
  toro_ref_id: string;
  total_disponible: number;
  total_inicial: number;
}

/**
 * Un lote con existencias, para el selector de pajilla de una inseminación.
 * Es por **lote** y no por toro: `toro_ref_id` es texto libre y está repetido
 * (varios toros comparten "NA"), así que agrupar por él escondía lotes.
 */
export interface PajillaDisponible {
  id: string;
  toro_nombre: string;
  toro_ref_id: string;
  fecha_compra: string;
  cantidad_disponible: number;
}

// ===== ARRIENDOS =====
export interface AbonoArriendo {
  id: string;
  arriendo_id: string;
  fecha: string;
  valor: number;
  observaciones: string | null;
  /** Gasto espejo (`gastos.source = 'arriendo_abono'`). NULL si se borró a mano. */
  gasto_id: number | null;
  created_at: string;
}

export interface Arriendo {
  id: string;
  arrendatario: string;
  finca_nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  canon: number;
  observaciones: string | null;
  created_at: string;
  /** Ordenados del abono más reciente al más antiguo. */
  abonos: AbonoArriendo[];
  /** Suma de los abonos. **Derivado en cada lectura**, no se guarda en la tabla. */
  total_abonado: number;
  /** `canon - total_abonado`. Negativo = se abonó de más. También derivado. */
  saldo: number;
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
  rol: "cooperativa_admin" | "cooperativa_user";
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
  ruta_id: number | null;
  ruta_nombre: string | null;
  itinerario_id: number | null;
  itinerario_nombre: string | null;
  fecha: string;
  litros: number;
  precio_litro: number;
  valor_total: number;
  created_at: string;
}
