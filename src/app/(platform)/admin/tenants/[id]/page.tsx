import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdminPagina } from "@/modules/core/platform/guards";
import { obtenerTenant } from "@/modules/core/platform/queries/platform.queries";
import { TenantDetalleView } from "@/modules/core/platform/components/tenant-detalle";
import { tenantIdSchema } from "@/modules/core/platform/schemas/platform.schema";

export default async function TenantDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdminPagina();
  const { id } = await params;
  if (!tenantIdSchema.safeParse(id).success) notFound();

  const r = await obtenerTenant(id);
  if (!r.ok) {
    if (r.code === "tenant_no_encontrado") notFound();
    return <p className="text-destructive text-sm">{r.message}</p>;
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/tenants" className="text-muted-foreground text-sm hover:underline">
        ← Clientes
      </Link>
      <TenantDetalleView detalle={r.data} />
    </div>
  );
}
