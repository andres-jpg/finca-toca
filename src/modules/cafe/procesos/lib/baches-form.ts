import { sugerirBaches, totalesBaches } from "./baches";
import { COPY_TUESTE } from "@/modules/cafe/copy";
import { aTextoDecimal, parsearDecimal } from "./numero";

// Los baches tal como los edita el operario en la tabla de la tostión: TEXTO (con coma decimal), no números, para
// no pelear con el cursor mientras escribe. `lib/baches.ts` tiene las cuentas con números; esto las aplica a lo
// escrito. Sin peso de salida ni grupos de pesaje (B-05): la planta no pesa por bache. Puro, sin React ni base.

export type NivelBache = "bajo" | "medio" | "alto";

export interface BacheFila {
  pesoEntradaKg: string;
  /** Nivel de tueste del bache; `null` = el de la tostión. */
  nivel: NivelBache | null;
  /** Temperatura (°C), opcional. */
  temperaturaC: string;
  /** Tiempo en minutos, opcional. */
  tiempoMin: string;
  /** Solo maquila con varios perfiles: «Perfil 1», «Perfil 2» (los baches se generan por perfil según sus kilos). */
  perfil: string | null;
}

export const filaVacia = (): BacheFila => ({ pesoEntradaKg: "", nivel: null, temperaturaC: "", tiempoMin: "", perfil: null });

/** Perfil de tueste que rellena los baches al generarlos (temperatura y tiempo del perfil). */
export interface PerfilBache {
  nivel: NivelBache | null;
  tempC: number | null;
  tiempoMin: number | null;
}

/**
 * Baches sugeridos para tostar `pesoKg` en una tostadora de `capacidadKg` (misma regla que `cafe.sugerir_baches()`):
 * partes iguales de como mucho la capacidad (54,0 kg / 13,5 → 4 × 13,5). Cada bache arranca con el perfil.
 * `[]` si el peso o la capacidad no sirven.
 */
export function filasSugeridas(pesoKg: number | null, capacidadKg: number, perfil?: PerfilBache | null, etiquetaPerfil: string | null = null): BacheFila[] {
  if (pesoKg === null) return [];
  try {
    return sugerirBaches(pesoKg, capacidadKg).map((kg) => ({
      ...filaVacia(),
      pesoEntradaKg: aTextoDecimal(kg),
      nivel: perfil?.nivel ?? null,
      temperaturaC: perfil?.tempC != null ? aTextoDecimal(perfil.tempC) : "",
      tiempoMin: perfil?.tiempoMin != null ? aTextoDecimal(perfil.tiempoMin) : "",
      perfil: etiquetaPerfil,
    }));
  } catch {
    return [];
  }
}

/**
 * Maquila con varios perfiles: una llamada a `filasSugeridas` por perfil con SUS kilos (27,0 kg del Perfil 1 + 13,5 kg
 * del Perfil 2 → 2 + 1 baches). Cada perfil rotula sus baches («Perfil 1»…).
 */
export function filasPorPerfil(perfiles: readonly (PerfilBache & { kg: number })[], capacidadKg: number): BacheFila[] {
  return perfiles.flatMap((p, i) => filasSugeridas(p.kg, capacidadKg, p, perfiles.length > 1 ? COPY_TUESTE.perfilN(i + 1) : null));
}

/**
 * Kilos de cada perfil para una tanda de `kgTanda` (B-02): los kilos del lote se escalan en proporción (el estimado tras la
 * trilla rara vez coincide con lo pesado) y el último perfil absorbe el redondeo, de modo que sumen exactamente `kgTanda`.
 * Un solo perfil se lleva toda la tanda. `[]` si no hay perfiles o la tanda no sirve.
 */
export function repartirKgPorPerfil<P extends PerfilBache & { kg: number }>(perfiles: readonly P[], kgTanda: number | null): P[] {
  if (kgTanda === null || !(kgTanda > 0) || perfiles.length === 0) return [];
  if (perfiles.length === 1) return [{ ...perfiles[0], kg: kgTanda }];
  const total = perfiles.reduce((s, p) => s + p.kg, 0);
  if (!(total > 0)) return [];
  let asignado = 0;
  return perfiles.map((p, i) => {
    const kg = i === perfiles.length - 1 ? Math.round((kgTanda - asignado) * 1000) / 1000 : Math.round(((p.kg * kgTanda) / total) * 1000) / 1000;
    asignado += kg;
    return { ...p, kg };
  });
}

export interface EstadoBaches {
  sumaEntradaKg: number;
  /** Kilos a tostar menos la suma de entradas de los baches (positivo = faltan kg por repartir); `null` sin kilos. */
  diferenciaKg: number | null;
  /** Todas las filas tienen entrada > 0. */
  filasValidas: boolean;
  /** Hay baches, son válidos y suman los kilos a tostar (tolerancia de 1 g, como la base). */
  cuadra: boolean;
}

/** Cuentas en vivo de la tabla de baches contra los kilos a tostar. */
export function estadoBaches(filas: readonly BacheFila[], entradaKg: number | null): EstadoBaches {
  const leidas = filas.map((f) => parsearDecimal(f.pesoEntradaKg));
  const { entradaKg: sumaEntradaKg } = totalesBaches(leidas.map((e) => ({ peso_entrada_kg: e ?? 0 })));
  const filasValidas = filas.length > 0 && leidas.every((e) => e !== null && e > 0);
  const diferenciaKg = entradaKg === null ? null : Math.round((entradaKg - sumaEntradaKg) * 1000) / 1000;
  return { sumaEntradaKg, diferenciaKg, filasValidas, cuadra: filasValidas && diferenciaKg !== null && Math.abs(diferenciaKg) <= 0.001 };
}

/** Lo que se ajusta a los baches seleccionados: solo cambia lo digitado (un campo vacío o ausente no se toca). */
export interface AjusteBaches {
  nivel?: NivelBache | null;
  tempC?: string | number | null;
  tiempoMin?: string | number | null;
}

const texto = (v: string | number | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const t = typeof v === "number" ? aTextoDecimal(v) : v.trim();
  return t === "" ? null : t;
};

/**
 * «Aplicar a los seleccionados» (B-05): copia nivel, temperatura y tiempo SOLO a los baches de `indices`, y solo los campos
 * que vienen con valor. Seleccionar los baches 3 y 4 y aplicar «Alto · 220 °C» cambia esos dos y deja el tiempo como estaba.
 */
export function aplicarASeleccionados(filas: readonly BacheFila[], indices: ReadonlySet<number>, ajuste: AjusteBaches): BacheFila[] {
  const temp = texto(ajuste.tempC);
  const tiempo = texto(ajuste.tiempoMin);
  return filas.map((f, i) =>
    indices.has(i)
      ? { ...f, nivel: ajuste.nivel ? ajuste.nivel : f.nivel, temperaturaC: temp ?? f.temperaturaC, tiempoMin: tiempo ?? f.tiempoMin }
      : f,
  );
}

/** ¿Lo escrito difiere del valor del perfil? Vacío o sin perfil = no difiere (no hay nada que resaltar). */
export function difiereDelPerfil(textoEscrito: string, perfil: number | null | undefined): boolean {
  if (perfil == null) return false;
  const n = parsearDecimal(textoEscrito);
  return n !== null && Math.abs(n - perfil) > 1e-9;
}

/** ¿El nivel del bache difiere del de la tostión? */
export function nivelDifiere(nivel: NivelBache | null, perfil: NivelBache | null): boolean {
  return nivel !== null && perfil !== null && nivel !== perfil;
}

/** ¿El operario aún no ha tocado nada de los baches (solo lo sugerido)? Para poder volver a sugerir sin pisarle trabajo. */
export function bachesSinTocar(filas: readonly BacheFila[], perfil?: PerfilBache | null): boolean {
  const t = perfil?.tempC != null ? aTextoDecimal(perfil.tempC) : "";
  const m = perfil?.tiempoMin != null ? aTextoDecimal(perfil.tiempoMin) : "";
  return filas.every((f) => f.temperaturaC === t && f.tiempoMin === m && (f.nivel ?? null) === (perfil?.nivel ?? null));
}

/** Alterna un índice en la selección (estado de cliente: `Set<number>`). */
export function alternarSeleccion(sel: ReadonlySet<number>, i: number): Set<number> {
  const s = new Set(sel);
  if (s.has(i)) s.delete(i);
  else s.add(i);
  return s;
}

/** Casilla general: selecciona todos, o ninguno si ya estaban todos. */
export function alternarTodos(sel: ReadonlySet<number>, total: number): Set<number> {
  return sel.size === total ? new Set() : new Set(Array.from({ length: total }, (_, i) => i));
}
