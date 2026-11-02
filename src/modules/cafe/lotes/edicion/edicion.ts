import { formatCOP } from "@/modules/core/formato/numeros";
import { fechaCorta, fechaHoraZona } from "../lib/formato";

// A-18 (FIN-136) · Edición de lotes. Funciones puras: armar el payload de `cafe.editar_lote` solo con lo que cambió, pasar
// la hora de llegada de la zona del cliente a un instante y redactar el impacto («merma de tostión 19,3 % → 18,1 %»).

export interface BacheEditable {
  id: string;
  numero: number;
  pesoEntradaKg: number;
  pesoSalidaKg: number;
  temperaturaC: number | null;
  tiempoMin: number | null;
}

export interface ProcesoEditable {
  id: string;
  tipo: "trilla" | "tostion" | "molienda" | "empaque";
  fecha: string;
  pesoEntradaKg: number;
  pesoSalidaKg: number;
  observaciones: string | null;
  baches: BacheEditable[];
}

export interface DatosEdicion {
  loteId: string;
  codigo: string;
  linea: "marca_propia" | "servicio";
  fechaRecepcion: string;
  /** Hora de llegada actual (`created_at`), ISO. */
  llegadaEn: string;
  precioCompraKg: number | null;
  facturaProveedor: string | null;
  observaciones: string | null;
  procesos: ProcesoEditable[];
}

/** Lo que el formulario muestra y el usuario cambia (textos, tal como se teclean). */
export interface FormEdicion {
  fechaRecepcion: string;
  llegadaFecha: string;
  llegadaHora: string; // HH:mm
  precioCompraKg: string;
  facturaProveedor: string;
  observaciones: string;
  procesos: Record<
    string,
    { fecha: string; pesoEntradaKg: string; pesoSalidaKg: string; observaciones: string; baches: Record<string, { pesoEntradaKg: string; pesoSalidaKg: string; temperaturaC: string; tiempoMin: string }> }
  >;
}

function numero(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Partes `YYYY-MM-DD` y `HH:mm` de un instante en la zona del cliente. */
export function partesEnZona(iso: string, zona: string): { fecha: string; hora: string } {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { fecha: `${g("year")}-${g("month")}-${g("day")}`, hora: `${g("hour")}:${g("minute")}` };
}

/** La fecha y hora de pared de la zona del cliente → instante ISO (UTC). `null` si no son válidas. */
export function instanteDesdeZona(fecha: string, hora: string, zona: string): string | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!f || !h) return null;
  const pared = Date.UTC(Number(f[1]), Number(f[2]) - 1, Number(f[3]), Number(h[1]), Number(h[2]));
  const desfase = (t: number) => {
    const z = partesEnZona(new Date(t).toISOString(), zona);
    const [a, m, d] = z.fecha.split("-").map(Number);
    const [hh, mm] = z.hora.split(":").map(Number);
    return Date.UTC(a, m - 1, d, hh, mm) - Math.floor(t / 60000) * 60000;
  };
  let t = pared - desfase(pared);
  t = pared - desfase(t);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function formularioInicial(d: DatosEdicion, zona: string): FormEdicion {
  const llegada = partesEnZona(d.llegadaEn, zona);
  return {
    fechaRecepcion: d.fechaRecepcion,
    llegadaFecha: llegada.fecha,
    llegadaHora: llegada.hora,
    precioCompraKg: d.precioCompraKg === null ? "" : String(d.precioCompraKg),
    facturaProveedor: d.facturaProveedor ?? "",
    observaciones: d.observaciones ?? "",
    procesos: Object.fromEntries(
      d.procesos.map((p) => [
        p.id,
        {
          fecha: p.fecha,
          pesoEntradaKg: String(p.pesoEntradaKg),
          pesoSalidaKg: String(p.pesoSalidaKg),
          observaciones: p.observaciones ?? "",
          baches: Object.fromEntries(
            p.baches.map((b) => [b.id, { pesoEntradaKg: String(b.pesoEntradaKg), pesoSalidaKg: String(b.pesoSalidaKg), temperaturaC: b.temperaturaC === null ? "" : String(b.temperaturaC), tiempoMin: b.tiempoMin === null ? "" : String(b.tiempoMin) }]),
          ),
        },
      ]),
    ),
  };
}

export type PayloadEdicion = {
  lote?: Record<string, unknown>;
  procesos?: { id: string; fecha?: string; peso_entrada_kg?: number | null; peso_salida_kg?: number | null; observaciones?: string | null; baches?: Record<string, unknown>[] }[];
};

/** Solo lo que difiere del original: la RPC además ignora lo que no cambia, pero así el envío (y el mensaje de error) son mínimos. */
export function construirPayload(d: DatosEdicion, f: FormEdicion, zona: string): PayloadEdicion {
  const lote: Record<string, unknown> = {};
  if (f.fechaRecepcion && f.fechaRecepcion !== d.fechaRecepcion) lote.fecha_recepcion = f.fechaRecepcion;
  const original = partesEnZona(d.llegadaEn, zona);
  if (f.llegadaFecha !== original.fecha || f.llegadaHora !== original.hora) {
    const iso = instanteDesdeZona(f.llegadaFecha, f.llegadaHora, zona);
    if (iso) lote.llegada_at = iso;
  }
  if (d.linea === "marca_propia") {
    const precio = numero(f.precioCompraKg);
    if (precio !== d.precioCompraKg && precio !== null) lote.precio_compra_kg = precio;
  }
  if (f.facturaProveedor.trim() !== (d.facturaProveedor ?? "")) lote.factura_proveedor = f.facturaProveedor.trim() || null;
  if (f.observaciones.trim() !== (d.observaciones ?? "")) lote.observaciones = f.observaciones.trim() || null;

  const procesos: NonNullable<PayloadEdicion["procesos"]> = [];
  for (const p of d.procesos) {
    const fp = f.procesos[p.id];
    if (!fp) continue;
    const item: NonNullable<PayloadEdicion["procesos"]>[number] = { id: p.id };
    if (fp.fecha && fp.fecha !== p.fecha) item.fecha = fp.fecha;
    if (fp.observaciones.trim() !== (p.observaciones ?? "")) item.observaciones = fp.observaciones.trim() || null;
    if (p.baches.length === 0) {
      const e = numero(fp.pesoEntradaKg);
      const s = numero(fp.pesoSalidaKg);
      if (e !== p.pesoEntradaKg) item.peso_entrada_kg = e;
      if (s !== p.pesoSalidaKg) item.peso_salida_kg = s;
    } else {
      const baches: Record<string, unknown>[] = [];
      for (const b of p.baches) {
        const fb = fp.baches[b.id];
        if (!fb) continue;
        const cambios: Record<string, unknown> = {};
        const e = numero(fb.pesoEntradaKg);
        const s = numero(fb.pesoSalidaKg);
        const t = numero(fb.temperaturaC);
        const m = numero(fb.tiempoMin);
        if (e !== b.pesoEntradaKg) cambios.peso_entrada_kg = e;
        if (s !== b.pesoSalidaKg) cambios.peso_salida_kg = s;
        if (t !== b.temperaturaC) cambios.temperatura_c = t;
        if (m !== b.tiempoMin) cambios.tiempo_min = m;
        if (Object.keys(cambios).length > 0) baches.push({ id: b.id, ...cambios });
      }
      if (baches.length > 0) item.baches = baches;
    }
    if (Object.keys(item).length > 1) procesos.push(item);
  }
  return { ...(Object.keys(lote).length > 0 ? { lote } : {}), ...(procesos.length > 0 ? { procesos } : {}) };
}

export function hayCambios(p: PayloadEdicion): boolean {
  return p.lote !== undefined || (p.procesos?.length ?? 0) > 0;
}

// --- Impacto -------------------------------------------------------------------------------------------------------------

export interface MetricasEdicion {
  fecha_recepcion?: string | null;
  llegada_at?: string | null;
  valor_compra?: number | null;
  merma_tostion_pct?: number | null;
  merma_molienda_pct?: number | null;
  valor_servicios?: number | null;
  costo_libra?: number | null;
  margen?: number | null;
}

const pct = (n: number) => `${n.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const kg = (n: number) => `${n.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 3 })} kg`;

/** «Se recalcularán: …» — solo las magnitudes que cambian de verdad. */
export function describirImpacto(antes: MetricasEdicion, despues: MetricasEdicion): string[] {
  const lineas: string[] = [];
  const comparar = (etiqueta: string, a: number | null | undefined, d: number | null | undefined, fmt: (n: number) => string) => {
    if (a == null && d == null) return;
    if (a != null && d != null && Math.abs(a - d) < 1e-9) return;
    lineas.push(`${etiqueta} (${a == null ? "—" : fmt(a)} → ${d == null ? "—" : fmt(d)})`);
  };
  comparar("merma de tostión", antes.merma_tostion_pct, despues.merma_tostion_pct, pct);
  comparar("merma de molienda", antes.merma_molienda_pct, despues.merma_molienda_pct, pct);
  comparar("valor del servicio", antes.valor_servicios, despues.valor_servicios, formatCOP);
  comparar("valor de la compra", antes.valor_compra, despues.valor_compra, formatCOP);
  comparar("costo por libra", antes.costo_libra, despues.costo_libra, formatCOP);
  comparar("margen por libra", antes.margen, despues.margen, formatCOP);
  return lineas;
}

// --- Historial -----------------------------------------------------------------------------------------------------------

const CAMPOS: Record<string, string> = {
  fecha_recepcion: "Fecha de recepción",
  llegada_at: "Hora de llegada",
  precio_compra_kg: "Precio de compra por kg",
  factura_proveedor: "Factura del proveedor",
  observaciones: "Observaciones",
  fecha: "Fecha",
  peso_entrada_kg: "Peso de entrada",
  peso_salida_kg: "Peso de salida",
  temperatura_c: "Temperatura (°C)",
  tiempo_min: "Tiempo (min)",
};

export const etiquetaCampo = (campo: string) => CAMPOS[campo] ?? campo;

/** Valor guardado como texto → texto legible según el campo. */
export function valorLegible(campo: string, valor: string | null, zona: string): string {
  if (valor === null || valor === "") return "—";
  if (campo === "llegada_at") return fechaHoraZona(valor, zona);
  if (campo === "fecha_recepcion" || campo === "fecha") return fechaCorta(valor);
  if (campo === "peso_entrada_kg" || campo === "peso_salida_kg") return kg(Number(valor));
  if (campo === "precio_compra_kg") return formatCOP(Number(valor));
  if (campo === "temperatura_c" || campo === "tiempo_min") return String(Number(valor));
  return valor;
}
