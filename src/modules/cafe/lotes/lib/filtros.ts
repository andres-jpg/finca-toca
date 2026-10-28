import { SERVICIOS_MAQUILA, etiquetaTipoLote } from "./tipo-lote";
import { esEstadoLote, etiquetaEstado, type EstadoLoteVisible } from "./estado";
import { fechaCorta } from "./formato";

// Filtros del listado de lotes. Viven en la URL (query string) para poder compartirla y para que la exportación a
// Excel (CO-35) reciba exactamente los mismos: `parsearFiltros` es la ÚNICA lectura de esos parámetros y
// `aplicarFiltrosLotes` la ÚNICA traducción a consulta, de modo que lo que ve la pantalla y lo que baja al Excel
// no pueden separarse. Pura: no conoce Next ni Supabase (solo la forma de un filtro de PostgREST).

/** `servicios` = todos los lotes de servicio (la pestaña «Servicios»); trilla y maquila los parten. */
export const TIPOS_FILTRO = ["marca_propia", "servicios", "trilla", "maquila"] as const;
export type TipoFiltro = (typeof TIPOS_FILTRO)[number];

export interface FiltrosLotes {
  tipo?: TipoFiltro;
  estado?: EstadoLoteVisible;
  /** `YYYY-MM-DD`, sobre la fecha de recepción. */
  desde?: string;
  hasta?: string;
  /** Id del tercero (proveedor o cliente). */
  tercero?: string;
  /** Texto contenido en el código. */
  q?: string;
  /** Página (1 = la primera). Solo para el listado: la exportación la ignora. */
  pagina: number;
}

/** Lotes por página del listado. */
export const LOTES_POR_PAGINA = 25;
/** Tope de la búsqueda por código. */
export const Q_MAX = 40;

type Param = string | string[] | undefined;
type EntradaParams = Record<string, Param> | URLSearchParams;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿`YYYY-MM-DD` es un día real del calendario? */
export function esFechaYmd(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d;
}

function primero(entrada: EntradaParams, clave: string): string | undefined {
  const v = entrada instanceof URLSearchParams ? (entrada.get(clave) ?? undefined) : entrada[clave];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

/**
 * Lee los filtros de `searchParams` (el objeto de una página de Next o un `URLSearchParams`). Lo inválido se
 * descarta en silencio (una URL vieja o a mano no debe romper la pantalla): tipo/estado desconocidos, fechas que
 * no existen, un tercero que no es uuid. Si `desde` > `hasta` se intercambian.
 */
export function parsearFiltros(entrada: EntradaParams): FiltrosLotes {
  const tipo = primero(entrada, "tipo");
  const estado = primero(entrada, "estado");
  let desde = primero(entrada, "desde");
  let hasta = primero(entrada, "hasta");
  const tercero = primero(entrada, "tercero");
  const q = primero(entrada, "q")?.slice(0, Q_MAX);
  const pagina = Number(primero(entrada, "pagina"));

  if (desde && !esFechaYmd(desde)) desde = undefined;
  if (hasta && !esFechaYmd(hasta)) hasta = undefined;
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];

  return {
    ...((TIPOS_FILTRO as readonly string[]).includes(tipo ?? "") ? { tipo: tipo as TipoFiltro } : {}),
    ...(esEstadoLote(estado) ? { estado } : {}),
    ...(desde ? { desde } : {}),
    ...(hasta ? { hasta } : {}),
    ...(tercero && UUID.test(tercero) ? { tercero: tercero.toLowerCase() } : {}),
    ...(q ? { q } : {}),
    pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : 1,
  };
}

/**
 * Los filtros como query string (sin `?`), solo lo que está puesto y en un orden fijo. `pagina` solo se incluye
 * si es mayor que 1 y `conPagina`; la exportación la pide `false`.
 */
export function serializarFiltros(filtros: Partial<FiltrosLotes>, opciones: { conPagina?: boolean } = {}): string {
  const p = new URLSearchParams();
  if (filtros.tipo) p.set("tipo", filtros.tipo);
  if (filtros.estado) p.set("estado", filtros.estado);
  if (filtros.desde) p.set("desde", filtros.desde);
  if (filtros.hasta) p.set("hasta", filtros.hasta);
  if (filtros.tercero) p.set("tercero", filtros.tercero);
  if (filtros.q) p.set("q", filtros.q);
  if (opciones.conPagina && filtros.pagina && filtros.pagina > 1) p.set("pagina", String(filtros.pagina));
  return p.toString();
}

/** ¿Hay algún filtro puesto (sin contar la página)? */
export function hayFiltros(filtros: FiltrosLotes): boolean {
  return Boolean(filtros.tipo || filtros.estado || filtros.desde || filtros.hasta || filtros.tercero || filtros.q);
}

const ETIQUETA_TIPO_FILTRO: Readonly<Record<TipoFiltro, string>> = {
  marca_propia: etiquetaTipoLote("marca_propia"),
  servicios: "Servicios",
  trilla: etiquetaTipoLote("trilla"),
  maquila: etiquetaTipoLote("maquila"),
};

export function etiquetaTipoFiltro(tipo: TipoFiltro): string {
  return ETIQUETA_TIPO_FILTRO[tipo];
}

/**
 * Los filtros en palabras, para la cabecera del Excel: «Tipo: Maquila · Estado: Parcial · 01/11/2026–30/11/2026».
 * Sin filtros: «Sin filtros». El tercero se nombra aparte (aquí solo hay su id): pasa `nombreTercero` si se conoce.
 */
export function describirFiltros(filtros: FiltrosLotes, nombreTercero?: string): string {
  const partes: string[] = [];
  if (filtros.tipo) partes.push(`Tipo: ${etiquetaTipoFiltro(filtros.tipo)}`);
  if (filtros.estado) partes.push(`Estado: ${etiquetaEstado(filtros.estado)}`);
  if (filtros.tercero) partes.push(`Tercero: ${nombreTercero ?? filtros.tercero}`);
  if (filtros.q) partes.push(`Código: ${filtros.q}`);
  if (filtros.desde && filtros.hasta) partes.push(`${fechaCorta(filtros.desde)}–${fechaCorta(filtros.hasta)}`);
  else if (filtros.desde) partes.push(`Desde ${fechaCorta(filtros.desde)}`);
  else if (filtros.hasta) partes.push(`Hasta ${fechaCorta(filtros.hasta)}`);
  return partes.length > 0 ? partes.join(" · ") : "Sin filtros";
}

/** Escapa `%`, `_` y `\` para usar el texto como patrón de `ilike`. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Lo mínimo que `aplicarFiltrosLotes` necesita de un filtro de PostgREST (`cafe.v_lotes`): cada método devuelve el
 * mismo tipo de constructor para poder encadenar. Con firma de método (bivariante) acepta el de supabase-js.
 */
export interface ConsultaFiltrable<Q> {
  eq(columna: string, valor: string): Q;
  gte(columna: string, valor: string): Q;
  lte(columna: string, valor: string): Q;
  ilike(columna: string, patron: string): Q;
  contains(columna: string, valor: string[]): Q;
  overlaps(columna: string, valor: string[]): Q;
}

/**
 * Traduce los filtros a condiciones sobre `cafe.v_lotes`. Es la que usan el listado y (CO-35) el Excel:
 *   marca_propia → línea marca propia · servicios → línea servicio
 *   trilla → servicio que incluye trilla · maquila → servicio que incluye tostión, molienda o empaque
 *   (un lote «Trilla + maquila» aparece en los dos)
 * La página no entra aquí: la pone quien pagina.
 */
export function aplicarFiltrosLotes<Q extends ConsultaFiltrable<Q>>(consulta: Q, filtros: FiltrosLotes): Q {
  let q = consulta;
  switch (filtros.tipo) {
    case "marca_propia":
      q = q.eq("linea", "marca_propia");
      break;
    case "servicios":
      q = q.eq("linea", "servicio");
      break;
    case "trilla":
      q = q.eq("linea", "servicio").contains("servicios", ["trilla"]);
      break;
    case "maquila":
      q = q.eq("linea", "servicio").overlaps("servicios", [...SERVICIOS_MAQUILA]);
      break;
  }
  if (filtros.estado) q = q.eq("estado", filtros.estado);
  if (filtros.desde) q = q.gte("fecha_recepcion", filtros.desde);
  if (filtros.hasta) q = q.lte("fecha_recepcion", filtros.hasta);
  if (filtros.tercero) q = q.eq("tercero_id", filtros.tercero);
  if (filtros.q) q = q.ilike("codigo", `%${escaparLike(filtros.q)}%`);
  return q;
}
