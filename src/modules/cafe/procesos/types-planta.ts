import type { AlertaCalidad } from "../recepciones/lib/calidad";
import type { DestinoDiferencia } from "../empaque/lib/empaque";
import type { LineaEmpaqueVista } from "../empaque/types";
import type { LineaLote, NivelTueste, TipoProceso } from "../lotes/types";
import type { ModoMolienda } from "./lib/molienda";
import type { ConfigMerma } from "./lib/resumen";
import type { EtapaKg, OrigenPlanta, SiguientePaso } from "./lib/pasos";
import type { EstadoLote } from "./types";

// Formas que la pantalla de planta (CO-28) lee de `cafe.v_lotes`, `cafe.v_origenes_disponibles` y `cafe.procesos`.
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
  /** Lo que queda en planta ahora (suma de los saldos; con tostiones sin empaque, estimado). */
  pesoActualKg: number;
  nivelTueste: NivelTueste | null;
  /** Perfil pedido por el cliente (opcional, solo con tostión). */
  perfilTempC?: number | null;
  perfilTiempoMin?: number | null;
  alertasCalidad: AlertaCalidad[];
  tieneDesvio: boolean;
  estado: EstadoLote;
  /** «2 de 3», DERIVADO por la base. */
  avanceTexto: string;
  /** Primer paso requerido con kilos pendientes; `null` si no queda ninguno. */
  siguiente: SiguientePaso | null;
  /** Pasos que exige el lote (los contratados, o tostión + empaque en marca propia). */
  serviciosRequeridos: TipoProceso[];
  /** Pasos completos (sus kilos ya se procesaron). */
  completos: Partial<Record<TipoProceso, boolean>>;
  /** Kilos que esperan cada etapa (un lote parcial aparece en varias columnas del tablero). */
  kgPorEtapa: Partial<Record<TipoProceso, number>>;
  /** `YYYY-MM-DD` del último proceso vigente: desde cuándo está listo. Solo en lotes `listo`. */
  listoDesde: string | null;
}

/** Perfil de tueste del lote (B-02): uno, o varios repartidos por kilos en maquila; en marca propia, el snapshot del tipo. */
export interface PerfilLote {
  orden: number;
  nivel: NivelTueste;
  tempC: number | null;
  tiempoMin: number | null;
  kg: number;
}

/** Un proceso ya registrado, para el historial del lote. */
export interface ProcesoHistorial {
  id: string;
  tipo: TipoProceso;
  fecha: string;
  pesoEntradaKg: number;
  /** `null` en una tostión sin empaque (su salida es la báscula del empaque) y en la molienda. */
  pesoSalidaKg: number | null;
  /** Solo trilla y tostión con salida; molienda y empaque no tienen merma. */
  mermaKg: number | null;
  mermaPct: number | null;
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
  /** Solo empaque: sobrante (báscula − bolsas). NO es merma. `null` en los demás procesos. */
  diferenciaKg: number | null;
  /** A dónde fue esa diferencia; `null` si no hubo (o en los empaques anteriores a A-01). */
  diferenciaDestino: DestinoDiferencia | null;
  /** Tanda de la que consume (el proceso previo); `null` = el café recibido. */
  origenProcesoId: string | null;
  /** Solo tostión: lo decidido para la molienda de la tanda (B-06); `null` = tanda anterior a esa decisión. */
  moliendaModo?: ModoMolienda | null;
  /** Kilos estimados a moler de la tanda; `null` si no se muele o no hay decisión. */
  moliendaKg?: number | null;
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
    tipoCafeId: string | null;
    fechaRecepcion: string;
    pesoRecibidoKg: number;
    pesoActualKg: number;
    servicios: TipoProceso[];
    serviciosRequeridos: TipoProceso[];
    nivelTueste: NivelTueste | null;
    perfilTempC?: number | null;
    perfilTiempoMin?: number | null;
    /** Perfiles del lote (`lote_perfil_tostion`), por orden; `[]` en lotes sin perfil. */
    perfiles: PerfilLote[];
    alertasCalidad: AlertaCalidad[];
    estado: EstadoLote;
    avanceTexto: string;
    anulado: boolean;
    /** Lo pedido en la recepción (terceros) y actualizado al cambiarlo en la tostión (B-03/B-06); `modo` null = sin dato. */
    moliendaSolicitada?: { modo: ModoMolienda | null; kg: number | null };
  };
  /** Saldo por origen (`v_origenes_disponibles`) con su fecha. */
  origenes: OrigenPlanta[];
  /** Resumen por etapa (`v_lote_etapas`), en kilos. */
  etapas: EtapaKg[];
  procesos: ProcesoHistorial[];
  config: ConfigPlanta;
}
