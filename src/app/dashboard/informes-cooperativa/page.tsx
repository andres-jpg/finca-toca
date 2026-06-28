import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { getFincasActivas } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { getItinerarios } from "@/features/itinerarios/actions/itinerarios.actions";
import { InformesForm } from "@/features/informes-cooperativa/components/informes-form";
import { FileSpreadsheet } from "lucide-react";

export default async function InformesCooperativaPage() {
  await checkRoutePermission(["cooperativa_admin"]);

  const [fincas, rutas, itinerarios] = await Promise.all([
    getFincasActivas(),
    getRutas(),
    getItinerarios(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#f0fdfa" }}>
          <FileSpreadsheet className="h-5 w-5" style={{ color: "#0d9488" }} />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">Informes</h1>
          <p className="text-sm text-stone-500 mt-0.5">Genera y descarga informes de recolecciones por quincena</p>
        </div>
      </div>
      <InformesForm fincas={fincas} rutas={rutas} itinerarios={itinerarios} />
    </div>
  );
}
