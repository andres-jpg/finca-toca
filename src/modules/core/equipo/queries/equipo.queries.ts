import { callRpc } from "../../rpc/call-rpc";
import type { RolTenant } from "../../auth/sesion";
import type { MiembroEquipo } from "../types";

// Fila de `listar_miembros_tenant()`. Los tipos generados no marcan como nulo el `ultimo_acceso` de una
// función con `RETURNS TABLE`, de ahí que se tipe aquí.
interface FilaMiembro {
  id: string;
  user_id: string;
  email: string;
  rol: RolTenant;
  activo: boolean;
  ultimo_acceso: string | null;
  created_at: string;
}

/**
 * Equipo del cliente actual (activos e inactivos). La RPC comprueba en la base que el llamante sea
 * owner/admin y que el cliente tenga `core.equipo`; solo devuelve miembros de ese cliente. Un fallo lanza:
 * una pantalla de equipo vacía por un error se confundiría con «no hay nadie».
 */
export async function listarMiembros(): Promise<MiembroEquipo[]> {
  const r = await callRpc<"public", "listar_miembros_tenant", FilaMiembro[]>("public", "listar_miembros_tenant", {});
  if (!r.ok) throw new Error(`No se pudo leer el equipo: ${r.code}`);
  return (r.data ?? []).map((f) => ({
    id: f.id,
    userId: f.user_id,
    email: f.email,
    rol: f.rol,
    activo: f.activo,
    ultimoAcceso: f.ultimo_acceso,
    creadoEn: f.created_at,
  }));
}
