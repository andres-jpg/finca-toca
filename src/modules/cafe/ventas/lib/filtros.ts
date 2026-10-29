import { esFechaYmd } from "@/modules/cafe/lotes/lib/filtros";
import type { TipoVenta } from "../types";

// Filtros del listado de ventas: viven en la URL (se pueden compartir). `parsearFiltrosVentas` es la única lectura de
// esos parámetros; lo inválido se descarta en silencio. Mismas reglas que las remisiones. Pura.

export const ESTADOS_FILTRO_VENTA = ["vigente", "anulada"] as const;
export type EstadoFiltroVenta = (typeof ESTADOS_FILTRO_VENTA)[number];
export const TIPOS_FILTRO_VENTA: readonly TipoVenta[] = ["venta", "cortesia"];

export interface FiltrosVentas {
  /** `YYYY-MM-DD`, sobre la fecha de la venta. */
  desde?: string;
  hasta?: string;
  tipo?: TipoVenta;
  /** Id del cliente (tercero). */
  tercero?: string;
  /** Solo las que requieren factura y aún no tienen el número de Aliados. */
  facturaPendiente?: boolean;
  estado?: EstadoFiltroVenta;
  /** Texto contenido en el número de la venta. */
  q?: string;
  pagina: number;
}

export const VENTAS_POR_PAGINA = 25;
export const Q_MAX_VENTA = 40;

type Param = string | string[] | undefined;
type EntradaParams = Record<string, Param> | URLSearchParams;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function primero(entrada: EntradaParams, clave: string): string | undefined {
  const v = entrada instanceof URLSearchParams ? (entrada.get(clave) ?? undefined) : entrada[clave];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

export function parsearFiltrosVentas(entrada: EntradaParams): FiltrosVentas {
  let desde = primero(entrada, "desde");
  let hasta = primero(entrada, "hasta");
  const tipo = primero(entrada, "tipo");
  const tercero = primero(entrada, "tercero");
  const estado = primero(entrada, "estado");
  const factura = primero(entrada, "factura");
  const q = primero(entrada, "q")?.slice(0, Q_MAX_VENTA);
  const pagina = Number(primero(entrada, "pagina"));

  if (desde && !esFechaYmd(desde)) desde = undefined;
  if (hasta && !esFechaYmd(hasta)) hasta = undefined;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];

  return {
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
    ...((TIPOS_FILTRO_VENTA as readonly string[]).includes(tipo ?? "") ? { tipo: tipo as TipoVenta } : {}),
    ...(tercero && UUID.test(tercero) ? { tercero: tercero.toLowerCase() } : {}),
    ...((ESTADOS_FILTRO_VENTA as readonly string[]).includes(estado ?? "") ? { estado: estado as EstadoFiltroVenta } : {}),
    ...(factura === "pendiente" ? { facturaPendiente: true } : {}),
    ...(q ? { q } : {}),
    pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : 1,
  };
}

/** Los filtros como query string (sin `?`), en orden fijo; la página solo si es > 1 y `conPagina`. */
export function serializarFiltrosVentas(filtros: Partial<FiltrosVentas>, opciones: { conPagina?: boolean } = {}): string {
  const p = new URLSearchParams();
  if (filtros.desde) p.set("desde", filtros.desde);
  if (filtros.hasta) p.set("hasta", filtros.hasta);
  if (filtros.tipo) p.set("tipo", filtros.tipo);
  if (filtros.tercero) p.set("tercero", filtros.tercero);
  if (filtros.estado) p.set("estado", filtros.estado);
  if (filtros.facturaPendiente) p.set("factura", "pendiente");
  if (filtros.q) p.set("q", filtros.q);
  if (opciones.conPagina && filtros.pagina && filtros.pagina > 1) p.set("pagina", String(filtros.pagina));
  return p.toString();
}

export function hayFiltrosVentas(filtros: FiltrosVentas): boolean {
  return Boolean(filtros.desde || filtros.hasta || filtros.tipo || filtros.tercero || filtros.estado || filtros.facturaPendiente || filtros.q);
}
