import { redirect } from "next/navigation";
import { requireSesion } from "@/modules/core/auth/guards";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";
import { fechaHoyEnZona } from "@/modules/cafe/insumos/lib/insumos";
import { PerfilesTuestePanel, type FilaPerfilTipo } from "@/modules/cafe/perfiles/components/perfiles-tueste-panel";
import { listarPerfilesTueste } from "@/modules/cafe/perfiles/queries/perfiles.queries";
import { listarTiposCafe } from "@/modules/cafe/tipos/queries/tipos.queries";

/**
 * Perfiles de tueste por tipo de café, con vigencia (B-18). Maestro: solo owner/admin lo ven y lo editan, igual que
 * el RLS de `cafe.perfil_tueste_tipo`.
 */
export const metadata = { title: "Perfiles de tueste" };

export default async function PerfilesTuestePage() {
  await requireModuloPagina("cafe.recepcion");
  const { rolTenant, tenant } = await requireSesion();
  if (rolTenant !== "owner" && rolTenant !== "admin") redirect("/dashboard");

  const [tipos, perfiles] = await Promise.all([listarTiposCafe(), listarPerfilesTueste()]);
  const filas: FilaPerfilTipo[] = [
    ...tipos
      .filter((t) => t.activo)
      .map((t) => ({ tipoCafeId: t.id, nombre: t.nombre, detalle: "Marca propia" })),
    { tipoCafeId: null, nombre: "Maquila", detalle: "Predeterminado de terceros" },
  ];

  return <PerfilesTuestePanel filas={filas} perfiles={perfiles} fechaHoy={fechaHoyEnZona(tenant.zonaHoraria)} />;
}
