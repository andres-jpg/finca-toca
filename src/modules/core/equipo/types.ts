import type { PantallaInicio, RolTenant } from "../auth/sesion";

/** Un miembro del equipo del cliente actual (fila de `listar_miembros_tenant()`). */
export interface MiembroEquipo {
  /** Id de la MEMBRESÍA: es el `registro_id` del historial (`audit.log`). */
  id: string;
  userId: string;
  email: string;
  rol: RolTenant;
  activo: boolean;
  /** `auth.users.last_sign_in_at`; `null` si aún no ha entrado. */
  ultimoAcceso: string | null;
  creadoEn: string;
  /** Pantalla de inicio configurada (operativos de café, A-07); `null` = la de por defecto. */
  pantallaInicio: PantallaInicio | null;
}
