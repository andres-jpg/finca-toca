import type { AlertaCalidad } from "../recepciones/lib/calidad";
import type { DestinoDiferencia } from "../empaque/lib/empaque";
import type { LineaEmpaqueVista } from "../empaque/types";
import type { LineaLote, NivelTueste, TipoProceso } from "../lotes/types";
import type { ConfigMerma } from "./lib/resumen";
import type { SiguientePaso } from "./lib/pasos";
import type { EstadoLote } from "./types";

// Formas que la pantalla de planta (CO-28) lee de `cafe.v_lotes`, `cafe.v_bultos_estado` y `cafe.procesos`.
// Los números llegan ya como `number` (PostgREST devuelve los `numeric` como JSON number).

/** Una tarjeta de la cola de trabajo: un lote con pasos pendientes. */
export interface TarjetaLotePlanta {
  id: string;
  codigo: string;
  linea: LineaLote;
  /** Cliente (servicio) o proveedor (marca propia); «—» si no se puede leer. */
  tercero: string;
  /** Tipo de café (solo marca propia). */
  tipoCafe: string | null;
  /** `YYYY-MM-DD`. */
  fechaRecepcion: string;
  /** Instante en que se registró el lote (`created_at`): la hora de llegada, que se muestra en la zona del cliente. */
  llegadaEn: string;
  pesoRecibidoKg: number;
  /** Lo que queda en planta ahora (salida atribuida del último paso de cada bulto). */
  pesoActualKg: number;
  numBultos: number;
  nivelTueste: NivelTueste | null;
  /** Perfil pedido por el cliente (opcional, solo con tostión). */
  perfilTempC?: number | null;
  perfilTiempoMin?: number | null;
  alertasCalidad: AlertaCalidad[];
  tieneDesvio: boolean;
  estado: EstadoLote;
  /** «2 de 3», DERIVADO por la base. */
  avanceTexto: string;
  /** Primer paso requerido con bultos pendientes; `null` si no queda ninguno. */
  siguiente: SiguientePaso | null;
  /** Pasos que exige el lote (los contratados, o tostión + empaque en marca propia). */
  serviciosRequeridos: TipoProceso[];
  /** Bultos que ya pasaron por cada paso. */
  procesados: Partial<Record<TipoProceso, number>>;
  /** Cuántos bultos esperan cada etapa (un lote parcial aparece en varias columnas del tablero). */
  bultosPorEtapa: Partial<Record<TipoProceso, number>>;
  /** `YYYY-MM-DD` del último proceso vigente: desde cuándo está listo. Solo en lotes `listo`. */
  listoDesde: string | null;
}

/** Un bulto con lo que se necesita para decidir si puede pasar por un paso, y de cuándo es cada uno ya hecho. */
export interface BultoPlanta {
  id: string;
  numero: number;
  pesoKg: number;
  pesoActualKg: number;
  pasos: TipoProceso[];
  /** Fecha y proceso con que el bulto pasó por cada paso (solo procesos vigentes). */
  hechos: Partial<Record<TipoProceso, { fecha: string; procesoId: string }>>;
}

/** Un proceso ya registrado, para el historial del lote. */
export interface ProcesoHistorial {
  id: string;
  tipo: TipoProceso;
  fecha: string;
  pesoEntradaKg: number;
  pesoSalidaKg: number;
  mermaKg: number;
  mermaPct: number;
  desvio: boolean;
  /** Referencia y tolerancia congeladas al registrar el proceso; `null` = sin referencia (molienda, empaque). */
  mermaReferenciaPct: number | null;
  toleranciaPts: number | null;
  valor: number;
  tarifaKg: number;
  nivelTueste: NivelTueste | null;
  observaciones: string | null;
  numBaches: number;
  /** Líneas de bolsas del empaque (tamaño × unidades); vacío en los demás procesos. */
  lineasEmpaque: LineaEmpaqueVista[];
  /** Solo empaque (A-01): lo que llegó y no entró en bolsas. NO es merma. `null` en los demás procesos. */
  diferenciaKg: number | null;
  /** A dónde fue esa diferencia; `null` si no hubo (o en los empaques anteriores a A-01). */
  diferenciaDestino: DestinoDiferencia | null;
  /** Números de los bultos que pasaron (vacío en un proceso anulado: sus bultos se liberan). */
  bultos: number[];
  bultoIds: string[];
  anulado: boolean;
  motivoAnulacion: string | null;
  createdAt: string;
}

/** Configuración del cliente que la pantalla necesita. */
export interface ConfigPlanta {
  /** Capacidad de un bache de la tostadora (para «Sugerir baches»). */
  capacidadTostadoraKg: number;
  merma: ConfigMerma;
  /** Tarifa vigente ahora por servicio; `null` = sin tarifa. */
  tarifas: Record<"trilla" | "tostion" | "molienda", number | null>;
}

/** Lo que necesita el formulario de proceso de un lote. */
export interface LoteParaProceso {
  lote: {
    id: string;
    codigo: string;
    linea: LineaLote;
    tercero: string;
    tipoCafe: string | null;
    fechaRecepcion: string;
    pesoRecibidoKg: number;
    pesoActualKg: number;
    numBultos: number;
    servicios: TipoProceso[];
    serviciosRequeridos: TipoProceso[];
    nivelTueste: NivelTueste | null;
    perfilTempC?: number | null;
    perfilTiempoMin?: number | null;
    alertasCalidad: AlertaCalidad[];
    estado: EstadoLote;
    avanceTexto: string;
    anulado: boolean;
  };
  bultos: BultoPlanta[];
  procesos: ProcesoHistorial[];
  config: ConfigPlanta;
}
