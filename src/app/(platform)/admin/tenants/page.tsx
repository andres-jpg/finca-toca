import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requirePlatformAdminPagina } from "@/modules/core/platform/guards";
import { listarTenantsResumen } from "@/modules/core/platform/queries/platform.queries";
import { TenantsTable } from "@/modules/core/platform/components/tenants-table";

export default async function TenantsPage() {
  await requirePlatformAdminPagina();
  const r = await listarTenantsResumen();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <Button asChild>
          <Link href="/admin/tenants/nuevo">Nuevo cliente</Link>
        </Button>
      </div>
      {r.ok ? <TenantsTable tenants={r.data} /> : <p className="text-destructive text-sm">{r.message}</p>}
    </div>
  );
}
