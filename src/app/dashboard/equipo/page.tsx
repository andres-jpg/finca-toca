import { redirect } from "next/navigation";
import { getHistorialCambios } from "@/modules/core/auditoria/actions/historial.actions";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { EquipoPanel, type MiembroVista } from "@/modules/core/equipo/components/equipo-panel";
import { formatearAcceso } from "@/modules/core/equipo/lib/formato";
import { TABLA_MIEMBROS } from "@/modules/core/equipo/lib/historial";
import { listarMiembros } from "@/modules/core/equipo/queries/equipo.queries";

/**
 * Equipo del cliente: invitar, cambiar rol, desactivar y ver el historial. Solo para clientes con el módulo
 * `core.equipo` activo y solo owner/admin (un operativo o la gerencia que teclee la URL acaba en su
 * dashboard). Las RPC `*_miembro_tenant` lo vuelven a comprobar en la base.
 */
export default async function EquipoPage() {
  await requireModuloPagina("core.equipo");
  const { user, tenant, rolTenant } = await requireSesion();
  if (rolTenant !== "owner" && rolTenant !== "admin") redirect("/dashboard");

  const [miembros, historial] = await Promise.all([listarMiembros(), getHistorialCambios(TABLA_MIEMBROS, undefined, 100)]);

  const vista: MiembroVista[] = miembros.map((m) => ({
    ...m,
    ultimoAccesoLabel: m.ultimoAcceso ? formatearAcceso(m.ultimoAcceso, tenant.zonaHoraria) : null,
  }));

  return <EquipoPanel miembros={vista} historial={historial} yoId={user.id} rolLlamante={rolTenant} />;
}
