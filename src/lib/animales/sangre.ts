import {
  MAX_COMPONENTES_SANGRE,
  construirSangre,
  parseSangre,
} from "@/lib/animales/razas";
import type { AnimalRaza } from "@/types";

/**
 * Reglas del selector de sangre (% de pureza por raza), separadas de la UI para poder
 * razonarlas y probarlas sueltas. `SangreSelector` solo pinta lo que decide este módulo.
 *
 * - Los porcentajes se **autocompletan hasta el 100%**: al elegir una raza, su fila toma lo
 *   que falta. En cuanto el usuario escribe uno a mano, esa fila queda `manual` y deja de
 *   recalcularse, con lo que la suma puede pasarse del 100% — se avisa, no se bloquea.
 * - La **tercera fila solo existe si las dos primeras suman menos del 100%**, y se limpia
 *   sola si dejan de hacerlo, para que no quede un porcentaje oculto contando en el valor.
 */

export interface FilaSangre {
  raza: AnimalRaza | "";
  pct: number | "";
  /** El usuario escribió este porcentaje: deja de autocompletarse. */
  manual: boolean;
}

export const FILA_SANGRE_VACIA: FilaSangre = { raza: "", pct: "", manual: false };

const num = (pct: number | "") => (pct === "" ? 0 : pct);

/** Una fila cuenta cuando tiene raza y un porcentaje mayor que cero. */
export function filaCompleta(fila: FilaSangre | undefined): boolean {
  return !!fila?.raza && num(fila.pct) > 0;
}

/** Suma de las filas con raza elegida. Puede superar 100 a propósito. */
export function sumaSangre(filas: FilaSangre[]): number {
  return filas.reduce((total, fila) => total + (fila.raza ? num(fila.pct) : 0), 0);
}

/** La tercera fila solo tiene sentido si las dos primeras están completas y no llegan a 100. */
export function mostrarTerceraRaza(filas: FilaSangre[]): boolean {
  if (!filaCompleta(filas[0]) || !filaCompleta(filas[1])) return false;
  return num(filas[0].pct) + num(filas[1].pct) < 100;
}

/**
 * Aplica las reglas de dependencia entre filas tras cualquier cambio: limpia las que se
 * quedan sin base, autocompleta en cascada las que el usuario no ha tocado y borra la
 * tercera si deja de tener sitio. Todos los cambios pasan por aquí, así que lo que se ve
 * en pantalla y el texto que se guarda nunca se separan.
 */
export function normalizarSangre(filas: FilaSangre[]): FilaSangre[] {
  const out = filas.map((f) => ({ ...f }));

  for (let i = 0; i < out.length; i++) {
    // Sin raza no hay porcentaje que valga; y si la fila anterior está incompleta, esta
    // aparece deshabilitada, así que tampoco debe seguir contando.
    if (!out[i].raza || (i > 0 && !filaCompleta(out[i - 1]))) {
      out[i] = { ...FILA_SANGRE_VACIA };
      continue;
    }
    if (i > 0 && !out[i].manual) {
      const restante = 100 - sumaSangre(out.slice(0, i));
      out[i].pct = restante > 0 ? restante : "";
    }
  }

  if (!mostrarTerceraRaza(out)) {
    out[MAX_COMPONENTES_SANGRE - 1] = { ...FILA_SANGRE_VACIA };
  }

  return out;
}

/** Estado inicial del selector a partir del valor guardado en `animales.sangre`. */
export function filasDesdeSangre(sangre: string | null | undefined): FilaSangre[] {
  const componentes = parseSangre(sangre) ?? [];
  return Array.from({ length: MAX_COMPONENTES_SANGRE }, (_, i) => {
    const componente = componentes[i];
    // Lo ya guardado se respeta tal cual: nada de recalcularlo al abrir el formulario.
    return componente
      ? { raza: componente.raza, pct: componente.pct, manual: true }
      : { ...FILA_SANGRE_VACIA };
  });
}

/** Texto que se guardará en `animales.sangre`, o `null` si no hay ninguna fila válida. */
export function sangreDesdeFilas(filas: FilaSangre[]): string | null {
  return construirSangre(
    filas.map((f) => (f.raza ? { raza: f.raza, pct: num(f.pct) } : null))
  );
}
