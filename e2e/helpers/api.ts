import { spawnSync } from "node:child_process";
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

/**
 * Crea un proveedor solo para un test. Los indicadores por proveedor (precio medio, humedad, merma) se ponderan sobre TODAS sus
 * compras del periodo: con el proveedor compartido del seed dependen de lo que hayan comprado los demás tests y del orden.
 */
export async function crearProveedor(nombre: string): Promise<string> {
  const supabase = await clienteComo("cafeAdmin");
  const identificacion = `7${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
  const { data, error } = await supabase
    .from("terceros")
    .insert({ tipo_identificacion: "NIT", identificacion, nombre, direccion: "Calle 1 # 2-3, Pereira", telefono: "3100000099", roles: ["proveedor"] })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo crear el proveedor «${nombre}»: ${error.message}`);
  return data.id as string;
}

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
export async function crearCompra(
  opciones: { tipo?: string; pesoKg?: number; precioKg?: number; /** Proveedor propio del test (por defecto, el del seed). */ terceroId?: string } = {},
): Promise<LoteCreado> {
  const r = await rpcCafe<{ id: string; codigo: string }>("registrar_compra", {
    tercero_id: opciones.terceroId ?? (await idTercero(PROVEEDOR.identificacion)),
    tipo_cafe_id: await idTipoCafe(opciones.tipo ?? "Excelso"),
    fecha: hoyBogota(),
    peso_kg: opciones.pesoKg ?? 125,
    precio_kg: opciones.precioKg ?? 18500,
    factura_proveedor: `E2E-${sufijo()}`,
  });
  return { id: r.id, codigo: r.codigo };
}

/** Recepción de un cliente de servicios por la RPC. */
export async function crearRecepcion(opciones: {
  pesoKg?: number;
  servicios: string[];
  nivelTueste?: string;
  /** Perfil de tueste pedido por el cliente (opcional). */
  perfilTempC?: number;
  perfilTiempoMin?: number;
  /** Varios perfiles por kilos (B-02); si va, manda sobre `nivelTueste` y el perfil único. */
  perfiles?: { nivel: string; tempC?: number; tiempoMin?: number; kg: number }[];
  /** `YYYY-MM-DD` de la recepción (por defecto, hoy): sirve para fabricar antigüedad. */
  fecha?: string;
}): Promise<LoteCreado> {
  const r = await rpcCafe<{ id: string; codigo: string }>("registrar_recepcion", {
    tercero_id: await idTercero(CLIENTE_SERVICIO.identificacion),
    fecha: opciones.fecha ?? hoyBogota(),
    peso_kg: opciones.pesoKg ?? 125,
    humedad_pct: 11,
    densidad: 680,
    servicios: opciones.servicios,
    ...(opciones.servicios.includes("tostion") ? { nivel_tueste: opciones.nivelTueste ?? "medio" } : {}),
    ...(opciones.perfilTempC !== undefined ? { perfil_temp_c: opciones.perfilTempC } : {}),
    ...(opciones.perfilTiempoMin !== undefined ? { perfil_tiempo_min: opciones.perfilTiempoMin } : {}),
    ...(opciones.perfiles
      ? { perfiles: opciones.perfiles.map((p) => ({ nivel: p.nivel, temp_c: p.tempC ?? null, tiempo_min: p.tiempoMin ?? null, kg: p.kg })) }
      : {}),
  });
  return { id: r.id, codigo: r.codigo };
}

/** Trilla de un lote de servicio por la RPC (el lote queda «listo» si solo contrató trilla). */
export async function registrarTrilla(lote: LoteCreado, entradaKg: number, salidaKg: number): Promise<void> {
  await rpcCafe("registrar_proceso", {
    lote_id: lote.id,
    tipo: "trilla",
    fecha: hoyBogota(),
    peso_entrada_kg: entradaKg,
    peso_salida_kg: salidaKg,
  });
}

/** Reparte `pesoKg` en baches de la capacidad de la tostadora (13,5 kg): solo entradas (la tostión no lleva salida). */
function bachesDe(pesoKg: number, capacidadKg = 13.5) {
  const baches: { peso_entrada_kg: number; temperatura_c: number; tiempo_min: number }[] = [];
  let resto = Math.round(pesoKg * 1000);
  const cap = Math.round(capacidadKg * 1000);
  while (resto > 0) {
    const e = Math.min(cap, resto);
    baches.push({ peso_entrada_kg: e / 1000, temperatura_c: 216, tiempo_min: 17 });
    resto -= e;
  }
  return baches;
}

/** Peso en báscula que dejaría una tostión de `entradaKg` con una merma fija del 18 % (a gramos). */
export function basculaDe(entradaKg: number, mermaPct = 18): number {
  return Math.round((entradaKg * 1000 * (100 - mermaPct)) / 100) / 1000;
}

/** Tostión por la RPC, por tandas y SIN peso de salida: devuelve el id del proceso y los kg que saldrían (báscula con merma del 18 %). */
export async function registrarTostion(lote: LoteCreado, entradaKg: number): Promise<number> {
  await rpcCafe("registrar_proceso", {
    lote_id: lote.id,
    tipo: "tostion",
    fecha: hoyBogota(),
    peso_entrada_kg: entradaKg,
    nivel_tueste: "medio",
    baches: bachesDe(entradaKg),
  });
  return basculaDe(entradaKg);
}

/** Tuesta una tanda de un lote de marca propia y la empaca con su báscula; `lineas` = presentación en gramos → unidades. */
export async function tostarYEmpacar(
  lote: LoteCreado,
  pesoKg: number,
  lineas: { presentacion_g: number; unidades: number }[],
): Promise<void> {
  const bascula = await registrarTostion(lote, pesoKg);
  await rpcCafe("registrar_empaque", {
    lote_id: lote.id,
    fecha: hoyBogota(),
    peso_bascula_kg: bascula,
    lineas,
  });
}

/** `YYYY-MM-DD` de hace `dias` días en la zona del cliente de café. */
export function haceDias(dias: number): string {
  const [a, m, d] = hoyBogota().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

/** Entrega (remisión) de lotes ya listos de un cliente por la RPC. */
export async function entregarLotes(lotes: LoteCreado[], fecha: string, extra: Record<string, unknown> = {}): Promise<{ id: string; numero: string }> {
  return rpcCafe<{ id: string; numero: string }>("entregar_lotes", {
    lote_ids: lotes.map((l) => l.id),
    fecha,
    recibe_nombre: "Ana Torres",
    recibe_documento: "43123456",
    ...extra,
  });
}

// --- Andamio de inventario y base local ---------------------------------------------------------------------------------

/** Ejecuta SQL en la base local (solo para preparar un estado que la aplicación ya no permite crear, p. ej. un saldo negativo antiguo). */
export function sqlLocal(sql: string): string {
  const contenedor = process.env.E2E_DB_CONTAINER ?? "supabase_db_finca-toca";
  const r = spawnSync("docker", ["exec", "-i", contenedor, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"], {
    input: sql,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`psql falló: ${r.stderr || r.error?.message}`);
  return r.stdout.trim();
}

/** Deja el stock de un producto terminado en `objetivo` unidades: con un movimiento directo (como el saldo negativo que dejó una venta anterior a B-11). */
export function dejarStockEn(nombre: string, objetivo: number): void {
  const nombreSql = nombre.replace(/'/g, "''");
  sqlLocal(`
    with a as (select id, tenant_id from public.articulos where nombre = '${nombreSql}' and tipo = 'producto_terminado'),
    s as (select a.id, a.tenant_id, coalesce((select sum(cantidad) from public.movimientos_inventario m where m.articulo_id = a.id), 0) as actual from a)
    insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo, observaciones)
    select tenant_id, id, ${objetivo} - actual, case when ${objetivo} - actual < 0 then 'perdida'::public.motivo_movimiento else 'ajuste'::public.motivo_movimiento end, 'Preparación E2E'
    from s where ${objetivo} - actual <> 0;`);
}

/**
 * Café molido empacado por la API: compra, tostión que pide molienda «todo», molienda confirmada y empaque de `unidades` bolsas
 * de `presentacionG` en molido. Deja stock de «<tipo> <presentación> molido».
 */
export async function crearMolidoEmpacado(presentacionG: number, unidades: number, tipo = "Excelso"): Promise<LoteCreado> {
  const lote = await crearCompra({ tipo, pesoKg: 40.5 });
  const fecha = hoyBogota();
  const tostion = await rpcCafe<{ id: string }>("registrar_proceso", {
    lote_id: lote.id,
    tipo: "tostion",
    fecha,
    peso_entrada_kg: 40.5,
    nivel_tueste: "medio",
    baches: bachesDe(40.5),
    molienda: { modo: "todo", kg: null },
  });
  await rpcCafe("confirmar_molienda", { lote_id: lote.id, tostion_proceso_id: tostion.id, fecha, modo: null, kg: null, observaciones: null });
  await rpcCafe("registrar_empaque", {
    lote_id: lote.id,
    fecha,
    peso_bascula_kg: basculaDe(40.5),
    lineas: [{ presentacion_g: presentacionG, unidades, forma: "molido" }],
  });
  return lote;
}

/** Vende `unidades` de un producto terminado al consumidor final por la RPC (con el precio vigente que se le indique). */
export async function venderUnidades(nombre: string, unidades: number, precioUnitario: number): Promise<void> {
  const supabase = await clienteComo("cafeAdmin");
  const { data: art, error: e1 } = await supabase.from("v_stock").select("articulo_id").eq("nombre", nombre).single();
  if (e1) throw new Error(`Artículo «${nombre}» no encontrado: ${e1.message}`);
  const { data: cf, error: e2 } = await supabase.from("terceros").select("id").eq("es_consumidor_final", true).single();
  if (e2) throw new Error(`Consumidor final no encontrado: ${e2.message}`);
  await rpcCafe("registrar_venta", {
    tipo: "venta",
    fecha: hoyBogota(),
    tercero_id: cf.id,
    lineas: [{ articulo_id: art.articulo_id, cantidad: unidades, precio_unitario: precioUnitario }],
  });
}
