import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";

/** Panel provisional de café hasta CO-34 (dashboard de gerencia). */
export default async function PanelCafePage() {
  await requireModuloPagina("cafe.dashboard");
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-gray-800">Panel</h1>
      <p className="mt-2 text-sm text-gray-500">Panel en construcción.</p>
    </div>
  );
}
