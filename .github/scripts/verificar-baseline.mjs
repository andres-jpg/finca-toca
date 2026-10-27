// Guarda del job `production` de migrate.yml: aborta si la baseline figura como
// PENDIENTE en el remoto. En producción el esquema ya existe, pero su historial de
// migraciones no sabe de la baseline hasta que se ejecuta, una sola vez y a mano,
// `supabase migration repair --status applied 20261019000000`. Sin ese repair, el
// `db push` intentaría reaplicar la baseline entera sobre datos reales.
//
// Uso: supabase migration list --linked --output-format json | node verificar-baseline.mjs
// Acepta también la tabla de texto (la versión va entre comillas invertidas).
import { fileURLToPath } from "node:url";

export const BASELINE = "20261019000000";

const VERSION = /^\d{14}$/;

/** @returns {{ local: string, remote: string }[]} */
function filasDeJson(texto) {
  const datos = JSON.parse(texto);
  if (!Array.isArray(datos?.migrations)) {
    throw new Error("el JSON no trae la lista `migrations`");
  }
  return datos.migrations.map((m) => ({
    local: String(m.local ?? "").trim(),
    remote: String(m.remote ?? "").trim(),
  }));
}

/** @returns {{ local: string, remote: string }[]} */
function filasDeTabla(texto) {
  const filas = [];
  for (const linea of texto.split("\n")) {
    const celdas = linea.split("|").map((c) => c.replaceAll("`", "").trim());
    if (celdas.length < 3) continue;
    const [local, remote] = celdas;
    if (VERSION.test(local) || VERSION.test(remote)) filas.push({ local, remote });
  }
  return filas;
}

/**
 * Evalúa la salida de `supabase migration list`. Falla cerrado: si no puede
 * interpretar la salida o no encuentra la baseline, tampoco deja pasar.
 * @param {string} texto
 * @param {string} [baseline]
 * @returns {{ ok: boolean, mensaje: string }}
 */
export function evaluarBaseline(texto, baseline = BASELINE) {
  let filas;
  try {
    filas = texto.trimStart().startsWith("{") ? filasDeJson(texto) : filasDeTabla(texto);
  } catch (e) {
    return { ok: false, mensaje: `No se pudo interpretar la salida de 'supabase migration list': ${e.message}` };
  }

  const fila = filas.find((f) => f.local === baseline || f.remote === baseline);
  if (!fila) {
    return {
      ok: false,
      mensaje: `La baseline ${baseline} no aparece en la salida de 'supabase migration list' (¿proyecto equivocado o formato nuevo?). Se aborta por seguridad.`,
    };
  }

  if (!fila.remote) {
    return {
      ok: false,
      mensaje: [
        `La baseline ${baseline} figura como PENDIENTE en el remoto: el historial de migraciones de producción no la conoce.`,
        "El 'db push' intentaría reaplicarla sobre un esquema que ya existe y con datos reales.",
        "Antes del primer push, una sola vez y a mano, con el proyecto de producción enlazado:",
        `  supabase migration repair --status applied ${baseline}`,
        "Después, vuelve a lanzar este workflow.",
      ].join("\n"),
    };
  }

  return { ok: true, mensaje: `Baseline ${baseline} ya registrada en el remoto: se puede empujar.` };
}

async function leerStdin() {
  const trozos = [];
  for await (const trozo of process.stdin) trozos.push(trozo);
  return Buffer.concat(trozos).toString("utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ok, mensaje } = evaluarBaseline(await leerStdin());
  if (ok) {
    console.log(mensaje);
  } else {
    // ::error:: lo pinta GitHub Actions como anotación del job
    console.error(`::error title=Baseline pendiente en el remoto::${mensaje.replaceAll("\n", "%0A")}`);
    console.error(mensaje);
    process.exit(1);
  }
}
