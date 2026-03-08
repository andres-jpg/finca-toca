import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { getPrecioActual, getHistorialPrecios } from "@/features/precios/actions/precios.actions";
import { PrecioConfig } from "@/features/precios/components/precio-config";

export default async function ConfiguracionPage() {
  await checkRoutePermission(["admin"]);

  const [precioActual, historial] = await Promise.all([
    getPrecioActual(),
    getHistorialPrecios(),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Configuración</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestión del precio de venta de leche</p>
      </div>
      <PrecioConfig precioActual={precioActual} historial={historial} />
    </div>
  );
}
