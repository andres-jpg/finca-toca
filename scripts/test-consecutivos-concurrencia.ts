/**
 * Prueba de concurrencia de `public.siguiente_consecutivo()` (FIN-95): 20 llamadas en paralelo vía
 * supabase-js contra la Supabase LOCAL deben devolver 20 números distintos y consecutivos.
 *
 *   pnpm db:start && pnpm db:reset      # una vez (necesita Docker)
 *   pnpm test:concurrencia
 *
 * Usa el usuario del seed `admin@vb.test` (password123) y una serie temporal propia de cada ejecución
 * (`T…`), así se puede repetir sin tocar las series reales. Lee `.env.local` (ver `.env.local.example`).
 * Se niega a correr contra cualquier URL que no sea local: escribe contadores y crea una serie.
 *
 * Los contadores no se pueden borrar desde la API (nadie tiene privilegios de escritura sobre
 * `consecutivos`), así que la serie de prueba solo se desactiva al terminar; `pnpm db:reset` la limpia.
 */
import { createClient } from "@supabase/supabase-js";

const LLAMADAS = 20;

try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: se usan las variables del entorno
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? "";

function fallar(mensaje: string): never {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

async function main() {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(`${url}/`)) {
    fallar(`NEXT_PUBLIC_SUPABASE_URL (${url || "vacía"}) no es la Supabase local; esta prueba solo corre en local.`);
  }
  if (!clave) fallar("Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY (pnpm db:status → Publishable key).");

  const supabase = createClient(url, clave, { auth: { persistSession: false } });

  const { error: errorLogin } = await supabase.auth.signInWithPassword({
    email: "admin@vb.test",
    password: "password123",
  });
  if (errorLogin) fallar(`No se pudo iniciar sesión como admin@vb.test (¿se ejecutó db reset con el seed?): ${errorLogin.message}`);

  const serie = `T${Date.now().toString(36).slice(-8).toUpperCase()}`;
  const { error: errorSerie } = await supabase
    .from("series_consecutivo")
    .insert({ serie, descripcion: "Prueba de concurrencia", formato: "{serie}-{anio}-{n:4}" });
  if (errorSerie) fallar(`No se pudo crear la serie de prueba: ${errorSerie.message}`);

  // Sin p_fecha: se ejercita también la fecha por defecto (la del tenant).
  const respuestas = await Promise.all(
    Array.from({ length: LLAMADAS }, () => supabase.rpc("siguiente_consecutivo", { p_serie: serie })),
  );

  await supabase.from("series_consecutivo").update({ activo: false }).eq("serie", serie);

  const errores = respuestas.filter((r) => r.error).map((r) => r.error?.message);
  if (errores.length > 0) fallar(`${errores.length} llamada(s) fallaron: ${errores[0]}`);

  const codigos = respuestas.map((r) => String(r.data));
  const formato = new RegExp(`^${serie}-(\\d{4})-(\\d{4})$`);
  const partes = codigos.map((c) => formato.exec(c));
  if (partes.some((p) => p === null)) fallar(`Algún código no tiene el formato ${serie}-AAAA-NNNN: ${codigos.join(", ")}`);

  const anios = new Set(partes.map((p) => p?.[1]));
  if (anios.size !== 1) fallar(`Los códigos mezclan años: ${[...anios].join(", ")}`);

  const numeros = partes.map((p) => Number(p?.[2])).sort((a, b) => a - b);
  const distintos = new Set(codigos).size;
  if (distintos !== LLAMADAS) fallar(`Se esperaban ${LLAMADAS} códigos distintos y hay ${distintos}: ${codigos.join(", ")}`);

  const consecutivos = numeros.every((n, i) => n === i + 1);
  if (!consecutivos) fallar(`Los números no son consecutivos desde 1: ${numeros.join(", ")}`);

  const ordenados = [...codigos].sort();
  console.log(`✓ ${LLAMADAS} llamadas en paralelo → ${LLAMADAS} códigos distintos y consecutivos (${ordenados[0]} … ${ordenados[LLAMADAS - 1]}).`);
}

main().catch((e: unknown) => fallar(e instanceof Error ? e.message : String(e)));
