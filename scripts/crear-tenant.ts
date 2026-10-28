/**
 * Alta de un cliente (tenant) desde la terminal, para entornos sin UI (FIN-98). Hace lo mismo que el
 * formulario de /admin: llama a `public.platform_crear_tenant()` (cliente + módulos + seed por vertical) y,
 * con `--owner`, vincula a un usuario existente como propietario.
 *
 *   pnpm tenant:create --nombre "Cofradía SAS" --slug cofradia --vertical cafe --nit 900123456-1 --owner persona@empresa.com
 *
 * Opciones:
 *   --nombre, --slug, --vertical (ganaderia|cooperativa|cafe)   obligatorias
 *   --nit, --plan                                               opcionales
 *   --modulos a,b                                               módulos opcionales además de los base
 *   --owner <email>                                             lo vincula como propietario (debe tener cuenta)
 *   --invitar                                                   si el owner no tiene cuenta, le envía una invitación de Supabase Auth
 *   --yes                                                       no pregunta (CI/scripts); sigue mostrando el destino
 *   --permitir-produccion                                       imprescindible para escribir en el proyecto de producción
 *
 * Usa la clave de servicio (SUPABASE_SERVICE_ROLE_KEY) y la URL (NEXT_PUBLIC_SUPABASE_URL) del entorno o de
 * `.env.local`. Es un script suelto: la app NUNCA lo importa, y el cliente admin vive solo aquí.
 *
 * Seguridad: muestra el proyecto destino y pide confirmación escribiendo su nombre; rechaza el proyecto de
 * producción salvo `--permitir-produccion`. Para staging o local no hace falta ningún flag.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

const REF_PRODUCCION = "tqaprzgccgoiiqxzincv";
const REF_STAGING = "wiquvwviaawvpjkthdam";
const VERTICALES = ["ganaderia", "cooperativa", "cafe"] as const;

try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: se usan las variables del entorno
}

function fallar(mensaje: string): never {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

type Destino = { tipo: "local" | "staging" | "produccion" | "otro"; nombre: string };

function clasificarDestino(url: string): Destino {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    fallar(`NEXT_PUBLIC_SUPABASE_URL (${url || "vacía"}) no es una URL válida.`);
  }
  if (host === "127.0.0.1" || host === "localhost" || host === "[::1]") return { tipo: "local", nombre: "local" };
  if (host.startsWith(`${REF_PRODUCCION}.`)) return { tipo: "produccion", nombre: REF_PRODUCCION };
  if (host.startsWith(`${REF_STAGING}.`)) return { tipo: "staging", nombre: REF_STAGING };
  return { tipo: "otro", nombre: host };
}

async function confirmar(destino: Destino, url: string, yes: boolean) {
  console.log(`Destino: ${destino.tipo.toUpperCase()} (${url})`);
  if (yes) return;
  if (!process.stdin.isTTY) fallar("Sin terminal interactiva: añade --yes para confirmar el destino.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(`Escribe «${destino.nombre}» para confirmar: `);
  rl.close();
  if (respuesta.trim() !== destino.nombre) fallar("Confirmación incorrecta: no se hizo ningún cambio.");
}

async function main() {
  const { values } = parseArgs({
    options: {
      nombre: { type: "string" },
      slug: { type: "string" },
      vertical: { type: "string" },
      nit: { type: "string" },
      plan: { type: "string" },
      modulos: { type: "string" },
      owner: { type: "string" },
      invitar: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "permitir-produccion": { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!values.nombre || !values.slug || !values.vertical) {
    fallar('Faltan datos. Uso: pnpm tenant:create --nombre "Cofradía SAS" --slug cofradia --vertical cafe [--nit …] [--owner email]');
  }
  const vertical = VERTICALES.find((v) => v === values.vertical);
  if (!vertical) fallar(`--vertical debe ser uno de: ${VERTICALES.join(", ")}.`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!clave) fallar("Falta SUPABASE_SERVICE_ROLE_KEY (para local: pnpm db:status → Secret key).");

  const destino = clasificarDestino(url);
  if (destino.tipo === "produccion" && !values["permitir-produccion"]) {
    fallar("El destino es PRODUCCIÓN. Si de verdad quieres dar de alta un cliente real, añade --permitir-produccion.");
  }
  await confirmar(destino, url, values.yes);

  const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: tenantId, error } = await supabase.rpc("platform_crear_tenant", {
    p_nombre: values.nombre,
    p_slug: values.slug,
    p_vertical: vertical,
    p_nit: values.nit,
    p_plan: values.plan,
    p_modulos: values.modulos ? values.modulos.split(",").map((m) => m.trim()).filter(Boolean) : undefined,
  });
  if (error) fallar(`No se pudo crear el cliente: ${error.details || error.message}`);
  console.log(`✓ Cliente «${values.nombre}» creado (${values.slug}, ${vertical}). id: ${tenantId}`);

  if (!values.owner) {
    console.log("  Sin --owner: añade miembros desde /admin/tenants o con este script en una nueva ejecución.");
    return;
  }

  const agregar = () =>
    supabase.rpc("platform_agregar_miembro", { p_tenant: tenantId, p_email: values.owner!, p_rol: "owner" });

  let { error: errorMiembro } = await agregar();
  if (errorMiembro?.message === "usuario_no_encontrado" && values.invitar) {
    const { error: errorInvitacion } = await supabase.auth.admin.inviteUserByEmail(values.owner);
    if (errorInvitacion) fallar(`Cliente creado, pero no se pudo invitar a ${values.owner}: ${errorInvitacion.message}`);
    console.log(`✓ Invitación enviada a ${values.owner}`);
    ({ error: errorMiembro } = await agregar());
  }
  if (errorMiembro) {
    const ayuda =
      errorMiembro.message === "usuario_no_encontrado" ? " (usa --invitar para enviarle una invitación, o crea su cuenta antes)" : "";
    fallar(`Cliente creado, pero no se pudo vincular a ${values.owner}: ${errorMiembro.details || errorMiembro.message}${ayuda}`);
  }
  console.log(`✓ ${values.owner} es propietario de ${values.slug}`);
}

main().catch((e: unknown) => fallar(e instanceof Error ? e.message : String(e)));
