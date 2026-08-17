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

/** Una raza con su % de pureza dentro del campo `sangre`. */
export interface ComponenteSangre {
  raza: AnimalRaza;
  pct: number;
}

/**
 * Cuántas razas admite el campo `sangre`. El selector muestra la tercera solo cuando las
 * dos primeras no llegan al 100%; subir este número aquí no basta, hay que añadirle la
 * fila correspondiente a `SangreSelector`.
 */
export const MAX_COMPONENTES_SANGRE = 3;

/**
 * Compone el texto de `animales.sangre` a partir de las razas con su % de pureza:
 * `"AYR:50% x HOL:30% x JER:20%"`. Ignora los componentes incompletos y devuelve `null`
 * si no queda ninguno — el campo es opcional.
 *
 * **No valida que sumen 100**: la finca registra a veces porcentajes que se pasan del
 * umbral, y el formulario lo permite avisando en pantalla.
 */
export function construirSangre(
  componentes: (ComponenteSangre | null | undefined)[]
): string | null {
  const validos = componentes.filter(
    (c): c is ComponenteSangre => !!c && !!c.raza && c.pct > 0
  );
  if (validos.length === 0) return null;

  return validos.map((c) => `${RAZA_CODIGOS[c.raza]}:${c.pct}%`).join(" x ");
}

const COMPONENTE_PATTERN = /^([A-Za-z]+):(\d{1,3})%$/;

/**
 * Inverso de `construirSangre`, para prellenar el selector al editar un animal.
 * Devuelve `null` si el texto no encaja con el formato (por ejemplo, un valor escrito a
 * mano antes de que existiera el selector), y el formulario lo trata como "sin definir".
 */
export function parseSangre(
  sangre: string | null | undefined
): ComponenteSangre[] | null {
  if (!sangre) return null;

  const componentes: ComponenteSangre[] = [];
  for (const parte of sangre.trim().split(/\s*x\s*/i)) {
    const match = parte.match(COMPONENTE_PATTERN);
    if (!match) return null;

    const raza = CODIGO_A_RAZA[match[1].toUpperCase()];
    if (!raza) return null;

    componentes.push({ raza, pct: Number(match[2]) });
  }

  return componentes.length > 0 ? componentes : null;
}
