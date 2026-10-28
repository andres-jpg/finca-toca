import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/get-user-role";
import type { Database } from "@/lib/supabase/database.types";
import { callRpc } from "../rpc/call-rpc";
import type { Tenant, TenantEstado, Vertical } from "../tenants/tenant.queries";

export type RolTenant = Database["public"]["Enums"]["rol_tenant"];
export type RolLegacy = Database["public"]["Enums"]["rol"];

export interface Membresia {
  tenantId: string;
  nombre: string;
  slug: string;
  vertical: Vertical;
  rol: RolTenant;
}

export interface Sesion {
  user: { id: string; email: string };
  /** El cliente activo (el de `tenant_actual()`), con vertical y módulos. */
  tenant: Tenant;
  rolTenant: RolTenant;
  /** Rol de la tabla `roles`, para las pantallas legacy; `null` si el usuario no tiene fila (p. ej. un platform admin). */
  rolLegacy: RolLegacy | null;
  esPlatformAdmin: boolean;
  membresias: Membresia[];
}

/**
 * La sesión cuando aún no hay cliente activo: un platform admin que todavía no ha elegido uno, o un
 * usuario sin membresía ni rol. `getSesion()` devuelve `null` en ese caso; esta variante deja al
 * layout ofrecer el selector (platform admin) o explicar que la cuenta no tiene acceso.
 */
export type SesionBase = Omit<Sesion, "tenant" | "rolTenant"> & {
  tenant: Tenant | null;
  rolTenant: RolTenant | null;
};

/** Forma del json de `public.mi_sesion()` (ver `supabase/migrations/20261029110000_sesion.sql`). */
interface MiSesionJson {
  tenant: {
    id: string;
    nombre: string;
    slug: string;
    vertical: Vertical;
    plan: string;
    estado: TenantEstado;
    logo_url: string | null;
    color_primario: string | null;
    zona_horaria: string;
    moneda: string;
    modulos: string[];
  } | null;
  rol_tenant: RolTenant | null;
  rol_legacy: RolLegacy | null;
  es_platform_admin: boolean;
  membresias: { tenant_id: string; nombre: string; slug: string; vertical: Vertical; rol: RolTenant }[];
}

function aTenant(t: NonNullable<MiSesionJson["tenant"]>): Tenant {
  return {
    id: t.id,
    nombre: t.nombre,
    slug: t.slug,
    vertical: t.vertical,
    plan: t.plan,
    estado: t.estado,
    logoUrl: t.logo_url,
    colorPrimario: t.color_primario,
    zonaHoraria: t.zona_horaria,
    moneda: t.moneda,
    modulos: t.modulos,
  };
}

/**
 * Sesión sin exigir cliente activo. Dos round-trips por request, en total: `getCurrentUser()` (Auth,
 * ya cacheada) + la RPC `mi_sesion()`, que trae en un solo json el cliente con sus módulos, los roles,
 * si es platform admin y las membresías. Envuelta en `React.cache()`: layout, páginas y guards del
 * mismo request comparten una única lectura.
 *
 * Módulo plano, no `"use server"`: `cache()` no se puede exportar desde un fichero de Server Actions.
 */
export const getSesionBase = cache(async function getSesionBase(): Promise<SesionBase | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const r = await callRpc<"public", "mi_sesion", MiSesionJson | null>("public", "mi_sesion", {});
  // Un fallo ya quedó en Sentry dentro de callRpc(); sin sesión legible no se concede nada.
  if (!r.ok || !r.data) return null;
  const s = r.data;

  return {
    user: { id: user.id, email: user.email ?? "" },
    tenant: s.tenant ? aTenant(s.tenant) : null,
    rolTenant: s.rol_tenant,
    rolLegacy: s.rol_legacy,
    esPlatformAdmin: s.es_platform_admin,
    membresias: s.membresias.map((m) => ({
      tenantId: m.tenant_id,
      nombre: m.nombre,
      slug: m.slug,
      vertical: m.vertical,
      rol: m.rol,
    })),
  };
});

/**
 * Único punto de entrada a la sesión para código nuevo (reemplaza a `getUserRole()` +
 * `getTenantActual()` + `getCurrentUser()` sueltos). `null` si no hay usuario o no tiene cliente
 * activo con rol; los guards de `./guards` lo traducen a redirect o a `AuthorizationError`.
 */
export const getSesion = cache(async function getSesion(): Promise<Sesion | null> {
  const base = await getSesionBase();
  if (!base?.tenant || !base.rolTenant) return null;
  return { ...base, tenant: base.tenant, rolTenant: base.rolTenant };
});
