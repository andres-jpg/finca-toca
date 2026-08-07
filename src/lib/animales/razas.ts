import type { AnimalRaza } from "@/types";

export const RAZAS: AnimalRaza[] = [
  "holstein",
  "jersey",
  "jerhol",
  "normando",
  "ayrshire",
  "cruce",
];

export const RAZA_LABELS: Record<AnimalRaza, string> = {
  holstein: "Holstein",
  jersey: "Jersey",
  jerhol: "Jerhol",
  normando: "Normando",
  ayrshire: "Ayrshire",
  cruce: "Otra",
};

/** Código corto de cada raza, usado para componer el campo `sangre` (ej. "AYR:88% x HOL:13%"). */
export const RAZA_CODIGOS: Record<AnimalRaza, string> = {
  holstein: "HOL",
  jersey: "JER",
  jerhol: "JHO",
  normando: "NOR",
  ayrshire: "AYR",
  cruce: "CRU",
};

const CODIGO_A_RAZA: Record<string, AnimalRaza> = Object.fromEntries(
  (Object.entries(RAZA_CODIGOS) as [AnimalRaza, string][]).map(([raza, codigo]) => [codigo, raza])
);

/**
 * Compone el texto de `animales.sangre` a partir de una o dos razas con su % de pureza.
 * Devuelve `null` si no hay al menos una raza con porcentaje — el campo es opcional.
 */
export function construirSangre(
  raza1: AnimalRaza | null,
  pct1: number | null,
  raza2?: AnimalRaza | null,
  pct2?: number | null
): string | null {
  if (!raza1 || !pct1) return null;
  if (raza2 && pct2) {
    return `${RAZA_CODIGOS[raza1]}:${pct1}% x ${RAZA_CODIGOS[raza2]}:${pct2}%`;
  }
  return `${RAZA_CODIGOS[raza1]}:${pct1}%`;
}

const SANGRE_PATTERN = /^([A-Z]+):(\d{1,3})%(?:\s*x\s*([A-Z]+):(\d{1,3})%)?$/i;

/** Inverso de `construirSangre`, para prellenar el selector al editar un animal. */
export function parseSangre(
  sangre: string | null | undefined
): { raza1: AnimalRaza; pct1: number; raza2: AnimalRaza | null; pct2: number | null } | null {
  if (!sangre) return null;
  const match = sangre.trim().match(SANGRE_PATTERN);
  if (!match) return null;

  const raza1 = CODIGO_A_RAZA[match[1].toUpperCase()];
  if (!raza1) return null;
  const pct1 = Number(match[2]);

  if (!match[3]) return { raza1, pct1, raza2: null, pct2: null };

  const raza2 = CODIGO_A_RAZA[match[3].toUpperCase()] ?? null;
  const pct2 = raza2 ? Number(match[4]) : null;
  return { raza1, pct1, raza2, pct2 };
}
