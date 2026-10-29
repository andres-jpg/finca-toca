import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PASSWORD, USUARIOS, type RolE2E } from "../fixtures/auth";

// Preparación y comprobación de datos por la API de Supabase, como un usuario real (RLS de verdad): para montar el
// punto de partida de un escenario sin repetir por pantalla lo que otro escenario ya prueba, y para leer stocks con
// exactitud. Lo que un escenario QUIERE probar siempre se hace por la interfaz; esto es el andamio.

const URL_API = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CLAVE = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cliente = SupabaseClient<any, any, any>;

const sesiones = new Map<RolE2E, Promise<Cliente>>();

/** Cliente de Supabase autenticado como ese usuario de prueba (una sesión por rol y proceso). */
export function clienteComo(rol: RolE2E): Promise<Cliente> {
  let c = sesiones.get(rol);
  if (!c) {
    c = (async () => {
      const supabase = createClient(URL_API(), CLAVE(), { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await supabase.auth.signInWithPassword({ email: USUARIOS[rol].email, password: PASSWORD });
      if (error) throw new Error(`No se pudo iniciar sesión como ${USUARIOS[rol].email}: ${error.message}`);
      return supabase;
    })();
    sesiones.set(rol, c);
  }
  return c;
}

/** Llama a una función del esquema `cafe` y devuelve su resultado; lanza si la base la rechaza. */
export async function rpcCafe<T = Record<string, unknown>>(
  fn: string,
  p: Record<string, unknown>,
  rol: RolE2E = "cafeAdmin",
): Promise<T> {
  const supabase = await clienteComo(rol);
  const { data, error } = await supabase.schema("cafe").rpc(fn, { p });
  if (error) throw new Error(`cafe.${fn} falló: ${error.message} ${error.details ?? ""}`);
  return data as T;
}

/** `YYYY-MM-DD` de hoy en la zona del cliente de café. */
export function hoyBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/** Sufijo corto y único para nombres, observaciones y números de factura de un test. */
export function sufijo(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.toUpperCase();
}

// --- Terceros y tipos del seed -------------------------------------------------------------------------------------

export async function idTercero(identificacion: string): Promise<string> {
  const supabase = await clienteComo("cafeAdmin");
  const { data, error } = await supabase.from("terceros").select("id").eq("identificacion", identificacion).single();
  if (error) throw new Error(`Tercero ${identificacion} no encontrado (¿se aplicó supabase/dev/e2e-seed.sql?): ${error.message}`);
  return data.id as string;
}

/** Proveedor y cliente de servicios del seed E2E. */
export const PROVEEDOR = { identificacion: "8009990010", nombre: "Proveedor E2E SAS" } as const;
export const CLIENTE_SERVICIO = { identificacion: "1009990020", nombre: "Cliente E2E" } as const;

export async function idTipoCafe(nombre: string): Promise<string> {
  const supabase = await clienteComo("cafeAdmin");
  const { data, error } = await supabase.schema("cafe").from("tipos_cafe").select("id").ilike("nombre", nombre).single();
  if (error) throw new Error(`Tipo de café ${nombre} no encontrado: ${error.message}`);
  return data.id as string;
}

// --- Inventario ------------------------------------------------------------------------------------------------------

/** Stock actual de un artículo por su nombre exacto («Excelso 500 g», «Bolsa 2.500 g»…). */
export async function stockDe(nombre: string): Promise<number> {
  const supabase = await clienteComo("cafeAdmin");
  const { data, error } = await supabase.from("v_stock").select("stock").eq("nombre", nombre).single();
  if (error) throw new Error(`Artículo «${nombre}» no encontrado: ${error.message}`);
  return Number(data.stock);
}

// --- Lotes y procesos (andamio) ------------------------------------------------------------------------------------

export interface LoteCreado {
  id: string;
  codigo: string;
}

/** Compra de marca propia por la RPC (la pantalla de compra se prueba en su propio escenario). */
export async function crearCompra(opciones: { tipo?: string; bultos?: number; pesoKg?: number; precioKg?: number } = {}): Promise<LoteCreado> {
  const bultos = opciones.bultos ?? 2;
  const r = await rpcCafe<{ id: string; codigo: string }>("registrar_compra", {
    tercero_id: await idTercero(PROVEEDOR.identificacion),
    tipo_cafe_id: await idTipoCafe(opciones.tipo ?? "Excelso"),
    fecha: hoyBogota(),
    peso_kg: opciones.pesoKg ?? bultos * 62.5,
    num_bultos: bultos,
    precio_kg: opciones.precioKg ?? 18500,
    factura_proveedor: `E2E-${sufijo()}`,
  });
  return { id: r.id, codigo: r.codigo };
}

/** Recepción de un cliente de servicios por la RPC. */
export async function crearRecepcion(opciones: {
  pesoKg?: number;
  bultos?: number;
  servicios: string[];
  nivelTueste?: string;
}): Promise<LoteCreado> {
  const r = await rpcCafe<{ id: string; codigo: string }>("registrar_recepcion", {
    tercero_id: await idTercero(CLIENTE_SERVICIO.identificacion),
    fecha: hoyBogota(),
    peso_kg: opciones.pesoKg ?? 125,
    num_bultos: opciones.bultos ?? 2,
    humedad_pct: 11,
    densidad: 680,
    servicios: opciones.servicios,
    ...(opciones.servicios.includes("tostion") ? { nivel_tueste: opciones.nivelTueste ?? "medio" } : {}),
  });
  return { id: r.id, codigo: r.codigo };
}

async function idsDeBultos(loteId: string): Promise<string[]> {
  const supabase = await clienteComo("cafeAdmin");
  const { data, error } = await supabase.schema("cafe").from("lote_bultos").select("id").eq("lote_id", loteId).order("numero");
  if (error) throw new Error(error.message);
  return (data ?? []).map((b: { id: string }) => b.id);
}

/** Reparte `pesoKg` en baches de la capacidad de la tostadora (13,5 kg) con una merma fija de `mermaPct`. */
function bachesDe(pesoKg: number, mermaPct = 18, capacidadKg = 13.5) {
  const baches: { peso_entrada_kg: number; peso_salida_kg: number }[] = [];
  let resto = Math.round(pesoKg * 1000);
  const cap = Math.round(capacidadKg * 1000);
  while (resto > 0) {
    const e = Math.min(cap, resto);
    baches.push({ peso_entrada_kg: e / 1000, peso_salida_kg: Math.round((e * (100 - mermaPct)) / 100) / 1000 });
    resto -= e;
  }
  return baches;
}

/** Tuesta TODOS los bultos de un lote de marca propia y empaca `lineas` (presentación en gramos → unidades). */
export async function tostarYEmpacar(
  lote: LoteCreado,
  pesoKg: number,
  lineas: { presentacion_g: number; unidades: number }[],
): Promise<void> {
  const bultos = await idsDeBultos(lote.id);
  const baches = bachesDe(pesoKg);
  const salida = baches.reduce((a, b) => a + Math.round(b.peso_salida_kg * 1000), 0) / 1000;
  await rpcCafe("registrar_proceso", {
    lote_id: lote.id,
    tipo: "tostion",
    fecha: hoyBogota(),
    bultos,
    peso_entrada_kg: pesoKg,
    peso_salida_kg: salida,
    nivel_tueste: "medio",
    baches,
  });
  await rpcCafe("registrar_empaque", {
    lote_id: lote.id,
    fecha: hoyBogota(),
    bultos,
    peso_entrada_kg: null,
    lineas,
  });
}
