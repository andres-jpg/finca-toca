import { requirePlatformAdminPagina } from "@/modules/core/platform/guards";
import { listarCatalogoModulos } from "@/modules/core/platform/queries/platform.queries";
import { NuevoTenantForm } from "@/modules/core/platform/components/nuevo-tenant-form";

export default async function NuevoTenantPage() {
  await requirePlatformAdminPagina();
  const catalogo = await listarCatalogoModulos();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nuevo cliente</h1>
      <NuevoTenantForm catalogo={catalogo} />
    </div>
  );
}
