import type { RolTenant } from "../auth/sesion";
import type { TenantEstado, Vertical } from "../tenants/tenant.queries";

/** Fila del listado `/admin/tenants` (RPC `platform_tenants_resumen()`). */
export interface TenantResumen {
  id: string;
  nombre: string;
  slug: string;
  vertical: Vertical;
  plan: string;
  estado: TenantEstado;
  nit: string | null;
  miembros: number;
  modulos: number;
  created_at: string;
}

export interface ModuloDeTenant {
  id: string;
  nombre: string;
  descripcion: string | null;
  vertical: Vertical | null;
  base: boolean;
  activo: boolean;
}

export interface MiembroDeTenant {
  user_id: string;
  email: string | null;
  rol: RolTenant;
  activo: boolean;
  created_at: string;
}

/** Detalle de un cliente (RPC `platform_obtener_tenant()`). */
export interface TenantDetalle {
  tenant: {
    id: string;
    nombre: string;
    slug: string;
    vertical: Vertical;
    plan: string;
    estado: TenantEstado;
    nit: string | null;
    logo_url: string | null;
    color_primario: string | null;
    zona_horaria: string;
    moneda: string;
    created_at: string;
  };
  modulos: ModuloDeTenant[];
  miembros: MiembroDeTenant[];
}

/** Módulo del catálogo (`public.modulos`), para el formulario de alta. */
export interface ModuloCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  vertical: Vertical | null;
  base: boolean;
}
