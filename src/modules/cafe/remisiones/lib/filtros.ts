import { esFechaYmd } from "@/modules/cafe/lotes/lib/filtros";

// Filtros del listado de remisiones: viven en la URL (se pueden compartir, y la exportación a Excel recibirá los
// mismos). `parsearFiltrosRemisiones` es la única lectura de esos parámetros; lo inválido se descarta en silencio.
// Mismas reglas que `parsearFiltros` de los lotes. Pura.

export const ESTADOS_FILTRO_REMISION = ["vigente", "anulada"] as const;
export type EstadoFiltroRemision = (typeof ESTADOS_FILTRO_REMISION)[number];

export interface FiltrosRemisiones {
  /** `YYYY-MM-DD`, sobre la fecha de entrega. */
  desde?: string;
  hasta?: string;
  /** Id del cliente (tercero). */
  tercero?: string;
  estado?: EstadoFiltroRemision;
  /** Texto contenido en el número de la remisión o en el código del lote. */
  q?: string;
  pagina: number;
}

export const REMISIONES_POR_PAGINA = 25;
export const Q_MAX_REMISION = 40;

type Param = string | string[] | undefined;
type EntradaParams = Record<string, Param> | URLSearchParams;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function primero(entrada: EntradaParams, clave: string): string | undefined {
  const v = entrada instanceof URLSearchParams ? (entrada.get(clave) ?? undefined) : entrada[clave];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

export function parsearFiltrosRemisiones(entrada: EntradaParams): FiltrosRemisiones {
  let desde = primero(entrada, "desde");
  let hasta = primero(entrada, "hasta");
  const tercero = primero(entrada, "tercero");
  const estado = primero(entrada, "estado");
  const q = primero(entrada, "q")?.slice(0, Q_MAX_REMISION);
  const pagina = Number(primero(entrada, "pagina"));

  if (desde && !esFechaYmd(desde)) desde = undefined;
  if (hasta && !esFechaYmd(hasta)) hasta = undefined;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];

  return {
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
    ...(tercero && UUID.test(tercero) ? { tercero: tercero.toLowerCase() } : {}),
    ...((ESTADOS_FILTRO_REMISION as readonly string[]).includes(estado ?? "") ? { estado: estado as EstadoFiltroRemision } : {}),
    ...(q ? { q } : {}),
    pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : 1,
  };
}

/** Los filtros como query string (sin `?`), en orden fijo; la página solo si es > 1 y `conPagina`. */
export function serializarFiltrosRemisiones(filtros: Partial<FiltrosRemisiones>, opciones: { conPagina?: boolean } = {}): string {
  const p = new URLSearchParams();
  if (filtros.desde) p.set("desde", filtros.desde);
  if (filtros.hasta) p.set("hasta", filtros.hasta);
  if (filtros.tercero) p.set("tercero", filtros.tercero);
  if (filtros.estado) p.set("estado", filtros.estado);
  if (filtros.q) p.set("q", filtros.q);
  if (opciones.conPagina && filtros.pagina && filtros.pagina > 1) p.set("pagina", String(filtros.pagina));
  return p.toString();
}

export function hayFiltrosRemisiones(filtros: FiltrosRemisiones): boolean {
  return Boolean(filtros.desde || filtros.hasta || filtros.tercero || filtros.estado || filtros.q);
}
