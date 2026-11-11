import { formatKg } from "@/modules/core/formato/numeros";
import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { horaLlegada, fechaCorta } from "@/modules/cafe/lotes/lib/formato";
import { textoPerfilTueste } from "@/modules/cafe/lotes/lib/perfil-tueste";
import type { NivelTueste, TipoProceso } from "@/modules/cafe/lotes/types";

// Reglas puras del flujo «Entregar» (A-14): qué lotes se agrupan por cliente, el resumen con el valor real, la
// validación de quién recibe y el texto de lo que el tiquete añade del lote. Nada de React ni de Supabase.

/** Un lote listo para entregar, con lo que cobró cada servicio (los procesos congelan su tarifa). */
export interface LoteEntregable {
  id: string;
  codigo: string;
  terceroId: string;
  cliente: string;
  /** `YYYY-MM-DD`. */
  fechaRecepcion: string;
  pesoRecibidoKg: number;
  pesoEntregadoKg: number;
  servicios: { tipo: TipoProceso; valor: number; kgEntrada: number; kgSalida: number }[];
}

export interface ClienteConLotes {
  terceroId: string;
  nombre: string;
  lotes: LoteEntregable[];
}

/** Clientes con al menos un lote listo, por nombre; sus lotes por código. */
export function agruparPorCliente(lotes: readonly LoteEntregable[]): ClienteConLotes[] {
  const mapa = new Map<string, ClienteConLotes>();
  for (const l of lotes) {
    const c = mapa.get(l.terceroId) ?? { terceroId: l.terceroId, nombre: l.cliente, lotes: [] };
    c.lotes.push(l);
    mapa.set(l.terceroId, c);
  }
  const clientes = [...mapa.values()];
  for (const c of clientes) c.lotes.sort((a, b) => a.codigo.localeCompare(b.codigo));
  return clientes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export const valorDeLote = (l: Pick<LoteEntregable, "servicios">): number => l.servicios.reduce((a, s) => a + s.valor, 0);

export interface ResumenEntrega {
  lotes: { id: string; codigo: string; valor: number; servicios: { tipo: TipoProceso; valor: number }[] }[];
  /** Suma de los valores reales de todos los servicios de los lotes elegidos. */
  total: number;
  pesoEntregadoKg: number;
}

/** El resumen lateral: valor real por lote y por servicio, y el total. */
export function resumirEntrega(lotes: readonly LoteEntregable[]): ResumenEntrega {
  const filas = lotes.map((l) => ({ id: l.id, codigo: l.codigo, valor: valorDeLote(l), servicios: l.servicios.map((s) => ({ tipo: s.tipo, valor: s.valor })) }));
  return {
    lotes: filas,
    total: filas.reduce((a, f) => a + f.valor, 0),
    pesoEntregadoKg: lotes.reduce((a, l) => a + l.pesoEntregadoKg, 0),
  };
}

/** La cédula se guarda solo con dígitos: quita puntos, guiones y espacios. */
export const soloDigitos = (v: string): string => v.replace(/\D/g, "");

export const DOCUMENTO_MIN_DIGITOS = 5;
export const DOCUMENTO_MAX_DIGITOS = 15;
export const NOMBRE_RECIBE_MAX = 120;

export interface ErroresQuienRecibe {
  nombre?: string;
  documento?: string;
}

/** Validación inline de quién recibe: nombre y cédula obligatorios. */
export function validarQuienRecibe(nombre: string, documento: string): ErroresQuienRecibe {
  const errores: ErroresQuienRecibe = {};
  if (nombre.trim().length < 3) errores.nombre = "Escribe el nombre de quien recibe.";
  else if (nombre.trim().length > NOMBRE_RECIBE_MAX) errores.nombre = `El nombre es demasiado largo (máximo ${NOMBRE_RECIBE_MAX} caracteres).`;
  const digitos = soloDigitos(documento);
  if (digitos.length === 0) errores.documento = "Escribe la cédula de quien recibe.";
  else if (digitos.length < DOCUMENTO_MIN_DIGITOS || digitos.length > DOCUMENTO_MAX_DIGITOS) {
    errores.documento = `La cédula debe tener entre ${DOCUMENTO_MIN_DIGITOS} y ${DOCUMENTO_MAX_DIGITOS} dígitos.`;
  }
  return errores;
}

/** Lo que el tiquete añade de cada lote (la remisión no lo guarda; ver `getExtrasTiquete`). */
export interface ExtrasLoteTiquete {
  llegadaEn: string;
  fechaRecepcion: string;
  nivelTueste: NivelTueste | null;
  perfilTempC: number | null;
  perfilTiempoMin: number | null;
  /** Bolsas que trajo el cliente: tamaño («5 kg») y unidades. */
  bolsasCliente: { tamano: string; unidades: number }[];
  /** Café que quedó suelto (sin bolsa), en kg. */
  sueltoKg: number;
}

/** «12/11/2026 · 8:42 a. m. · 500,0 kg» (B-17: kilos, sin bultos). */
export function lineaLlegada(e: Pick<ExtrasLoteTiquete, "llegadaEn" | "fechaRecepcion">, pesoRecibidoKg: number, zona: string): string {
  return `${fechaCorta(e.fechaRecepcion)} · ${horaLlegada(e.llegadaEn, zona)} · ${formatKg(pesoRecibidoKg)}`;
}

/** Perfil de tueste: «Medio · 222 °C · 17 min»; `null` si el lote no pidió tostión. */
export function lineaPerfil(e: Pick<ExtrasLoteTiquete, "nivelTueste" | "perfilTempC" | "perfilTiempoMin">): string | null {
  const t = textoPerfilTueste({ nivel: e.nivelTueste, tempC: e.perfilTempC, tiempoMin: e.perfilTiempoMin });
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

/** «2 × 5 kg · 3 × 500 g» o `null` si el cliente no trajo bolsas. */
export function lineaBolsasCliente(bolsas: readonly { tamano: string; unidades: number }[]): string | null {
  if (bolsas.length === 0) return null;
  return bolsas.map((b) => `${b.unidades} × ${b.tamano}`).join(" · ");
}

/** «2,1 kg» o `null` si no quedó nada a granel. */
export function lineaSuelto(kg: number): string | null {
  return kg > 0 ? formatKg(kg) : null;
}

export const totalTexto = (total: number): string => formatearCOP(total);
