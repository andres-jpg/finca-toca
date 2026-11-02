import { sugerirBaches, totalesBaches } from "./baches";
import { aTextoDecimal, parsearDecimal } from "./numero";

// Los baches tal como los edita el operario en la tabla de la tostión: TEXTO (con coma decimal), no números, para
// no pelear con el cursor mientras escribe. `lib/baches.ts` (CO-27) tiene las cuentas con números; esto las
// aplica a lo escrito. Puro, sin React ni base.

export interface BacheFila {
  pesoEntradaKg: string;
  pesoSalidaKg: string;
  /** Temperatura real, opcional (A-12). */
  temperaturaC: string;
  /** Tiempo real en minutos, opcional (A-12). */
  tiempoMin: string;
  /** Número del grupo de pesaje (1..n) si el bache se pesó junto a otros; `null` = pesaje individual. */
  grupo: number | null;
  /** Peso de salida CONJUNTO del grupo (el mismo texto en todos sus baches). Vacío sin grupo. */
  pesoGrupoKg: string;
}

export const filaVacia = (): BacheFila => ({
  pesoEntradaKg: "",
  pesoSalidaKg: "",
  temperaturaC: "",
  tiempoMin: "",
  grupo: null,
  pesoGrupoKg: "",
});

/**
 * Baches sugeridos para tostar `pesoKg` en una tostadora de `capacidadKg` (misma regla que
 * `cafe.sugerir_baches()`): solo rellena la ENTRADA de cada bache; la salida la pesa el operario.
 * `[]` si el peso o la capacidad no sirven.
 */
export function filasSugeridas(pesoKg: number | null, capacidadKg: number): BacheFila[] {
  if (pesoKg === null) return [];
  try {
    return sugerirBaches(pesoKg, capacidadKg).map((kg) => ({ ...filaVacia(), pesoEntradaKg: aTextoDecimal(kg) }));
  } catch {
    return [];
  }
}

export interface EstadoBaches {
  sumaEntradaKg: number;
  sumaSalidaKg: number;
  /** Entrada del proceso menos la suma de entradas de los baches (positivo = faltan kg por repartir); `null` sin entrada. */
  diferenciaKg: number | null;
  /** Todas las filas tienen entrada > 0 y salida entre 0 y su entrada. */
  filasValidas: boolean;
  /** Hay baches, son válidos y suman la entrada del proceso (tolerancia de 1 g, como la base). */
  cuadra: boolean;
}

/** Cuentas en vivo de la tabla de baches contra el peso de entrada del proceso. */
export function estadoBaches(filas: readonly BacheFila[], entradaKg: number | null): EstadoBaches {
  const leidas = filas.map((f) => ({ e: parsearDecimal(f.pesoEntradaKg), s: parsearDecimal(f.pesoSalidaKg) }));
  const { entradaKg: sumaEntradaKg, salidaKg: sumaSalidaKg } = totalesBaches(
    leidas.map((f) => ({ peso_entrada_kg: f.e ?? 0, peso_salida_kg: f.s ?? 0 })),
  );
  const filasValidas =
    filas.length > 0 && leidas.every((f) => f.e !== null && f.e > 0 && f.s !== null && f.s >= 0 && f.s <= f.e);
  const diferenciaKg = entradaKg === null ? null : Math.round((entradaKg - sumaEntradaKg) * 1000) / 1000;
  return {
    sumaEntradaKg,
    sumaSalidaKg,
    diferenciaKg,
    filasValidas,
    cuadra: filasValidas && diferenciaKg !== null && Math.abs(diferenciaKg) <= 0.001,
  };
}

// --- Pesaje agrupado (A-12) --------------------------------------------------------------------------------------

/**
 * Reparte el peso de un grupo entre sus baches en proporción a su ENTRADA, a gramos; el último absorbe el resto
 * (misma convención que `repartirPeso`). 22,1 kg entre dos baches de 13,5 → 11,05 y 11,05.
 */
export function repartirProporcional(totalKg: number, entradasKg: readonly number[]): number[] {
  const sumaG = entradasKg.reduce((a, e) => a + Math.round(e * 1000), 0);
  if (entradasKg.length === 0 || sumaG <= 0) return entradasKg.map(() => 0);
  const totalG = Math.round(totalKg * 1000);
  const partes = entradasKg.map((e) => Math.floor((totalG * Math.round(e * 1000)) / sumaG));
  partes[partes.length - 1] += totalG - partes.reduce((a, p) => a + p, 0);
  return partes.map((g) => g / 1000);
}

/**
 * Deja coherentes los grupos: disuelve los de un solo bache, los numera 1..k por orden de aparición y reparte el
 * peso conjunto entre sus miembros (la salida de cada bache queda escrita, así el resto del formulario no sabe de
 * grupos). Sin peso conjunto válido los miembros quedan sin salida. Idempotente.
 */
export function normalizarGrupos(filas: readonly BacheFila[]): BacheFila[] {
  const miembros = new Map<number, number[]>();
  filas.forEach((f, i) => {
    if (f.grupo !== null) miembros.set(f.grupo, [...(miembros.get(f.grupo) ?? []), i]);
  });
  const numero = new Map<number, number>();
  const salida = filas.map((f) => ({ ...f }));
  for (const [grupo, idx] of miembros) {
    if (idx.length < 2) {
      salida[idx[0]] = { ...salida[idx[0]], grupo: null, pesoGrupoKg: "" };
      continue;
    }
    numero.set(grupo, numero.size + 1);
  }
  for (const [grupo, idx] of miembros) {
    const nuevo = numero.get(grupo);
    if (nuevo === undefined) continue;
    const total = parsearDecimal(salida[idx[0]].pesoGrupoKg);
    const entradas = idx.map((i) => parsearDecimal(salida[i].pesoEntradaKg));
    const reparto =
      total !== null && entradas.every((e): e is number => e !== null && e > 0)
        ? repartirProporcional(total, entradas)
        : null;
    idx.forEach((i, k) => {
      salida[i] = {
        ...salida[i],
        grupo: nuevo,
        pesoGrupoKg: salida[idx[0]].pesoGrupoKg,
        pesoSalidaKg: reparto ? aTextoDecimal(reparto[k]) : "",
      };
    });
  }
  return salida;
}

/** Une los baches `indices` en un grupo nuevo (si alguno ya estaba en otro, ese grupo se une también). */
export function agrupar(filas: readonly BacheFila[], indices: readonly number[]): BacheFila[] {
  if (indices.length < 2) return [...filas];
  const previos = new Set(indices.map((i) => filas[i]?.grupo).filter((g): g is number => g !== null && g !== undefined));
  const nuevo = Math.max(0, ...filas.map((f) => f.grupo ?? 0)) + 1;
  return normalizarGrupos(
    filas.map((f, i) =>
      indices.includes(i) || (f.grupo !== null && previos.has(f.grupo)) ? { ...f, grupo: nuevo, pesoGrupoKg: "" } : f,
    ),
  );
}

/** Deshace un grupo: sus baches vuelven al pesaje individual conservando la salida repartida. */
export function desagrupar(filas: readonly BacheFila[], grupo: number): BacheFila[] {
  return normalizarGrupos(filas.map((f) => (f.grupo === grupo ? { ...f, grupo: null, pesoGrupoKg: "" } : f)));
}

export interface GrupoPesaje {
  grupo: number;
  indices: number[];
  entradaKg: number;
  pesoGrupoKg: string;
}

/** Los grupos de pesaje de la tabla (tras `normalizarGrupos`), en orden. */
export function gruposDe(filas: readonly BacheFila[]): GrupoPesaje[] {
  const mapa = new Map<number, GrupoPesaje>();
  filas.forEach((f, i) => {
    if (f.grupo === null) return;
    const g = mapa.get(f.grupo) ?? { grupo: f.grupo, indices: [], entradaKg: 0, pesoGrupoKg: f.pesoGrupoKg };
    g.indices.push(i);
    g.entradaKg = Math.round((g.entradaKg + (parsearDecimal(f.pesoEntradaKg) ?? 0)) * 1000) / 1000;
    mapa.set(f.grupo, g);
  });
  return [...mapa.values()];
}

/** «Aplicar a todos los baches»: copia temperatura y tiempo del pedido (los que existan) a cada bache. */
export function aplicarPedidoATodos(
  filas: readonly BacheFila[],
  pedido: { tempC?: number | null; tiempoMin?: number | null },
): BacheFila[] {
  return filas.map((f) => ({
    ...f,
    temperaturaC: pedido.tempC != null ? aTextoDecimal(pedido.tempC) : f.temperaturaC,
    tiempoMin: pedido.tiempoMin != null ? aTextoDecimal(pedido.tiempoMin) : f.tiempoMin,
  }));
}

/** ¿Lo escrito difiere del valor pedido? Vacío o sin pedido = no difiere (no hay nada que resaltar). */
export function difiereDelPedido(texto: string, pedido: number | null | undefined): boolean {
  if (pedido == null) return false;
  const n = parsearDecimal(texto);
  return n !== null && Math.abs(n - pedido) > 1e-9;
}

/** ¿El operario aún no ha tocado nada de los baches (solo la entrada sugerida)? Para poder volver a sugerir sin pisarle trabajo. */
export function bachesSinTocar(filas: readonly BacheFila[]): boolean {
  return filas.every((f) => f.pesoSalidaKg === "" && f.temperaturaC === "" && f.tiempoMin === "" && f.grupo === null);
}
