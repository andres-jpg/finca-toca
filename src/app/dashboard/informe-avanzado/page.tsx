import Link from "next/link";
import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { getAlertasVentana } from "@/features/alertas/actions/alertas.queries";
import { ALERTA_CONFIG, SEVERIDAD_CLASSES, textoPlazo } from "@/features/alertas/components/alerta-config";
import { cn } from "@/lib/utils";
import type { Alerta } from "@/types";

const VENTANAS = [30, 60, 90, 180, 365];
const VENTANA_DEFECTO = 90;

function Tabla({ tipo, alertas }: { tipo: "secado" | "parto"; alertas: Alerta[] }) {
  const config = ALERTA_CONFIG[tipo];
  const Icon = config.icon;
  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
        <span
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: config.bg }}
        >
          <Icon className="h-4 w-4" style={{ color: config.color }} />
        </span>
        <h3 className="font-semibold text-stone-800">{config.label}</h3>
        <span className="text-sm text-stone-500">({alertas.length})</span>
      </div>
      {alertas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-stone-500">Sin animales en esta ventana.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-500 bg-stone-50">
              <th className="px-4 py-2">Animal</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Plazo</th>
              <th className="px-4 py-2 hidden sm:table-cell">Base</th>
            </tr>
          </thead>
          <tbody>
            {alertas.map((a) => (
              <tr key={a.id} className="border-t border-stone-100">
                <td className="px-4 py-2">
                  <Link
                    href={`/dashboard/animales/${a.animal_id}`}
                    className="font-medium text-stone-800 hover:text-blue-600 hover:underline"
                  >
                    {a.animal_nombre}
                  </Link>{" "}
                  <span className="font-mono text-xs text-stone-400">#{a.animal_identificador}</span>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{a.fecha_objetivo}</td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "inline-block rounded-full border px-2 py-0.5 text-xs",
                      SEVERIDAD_CLASSES[a.severidad]
                    )}
                  >
                    {textoPlazo(a)}
                  </span>
                </td>
                <td className="px-4 py-2 text-stone-500 hidden sm:table-cell">{a.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function InformeAvanzadoPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const [{ dias: diasParam }] = await Promise.all([
    searchParams,
    checkRoutePermission(["admin", "viewer"]),
  ]);
  const pedido = Number(diasParam);
  const dias = VENTANAS.includes(pedido) ? pedido : VENTANA_DEFECTO;

  const alertas = await getAlertasVentana(dias);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">
            Informe avanzado
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Secados y partos probables de los próximos {dias} días (más los vencidos). Las mismas
            fechas salen en el Excel de Animales.
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {VENTANAS.map((v) => (
            <Link
              key={v}
              href={`/dashboard/informe-avanzado?dias=${v}`}
              className={cn(
                "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                dias === v
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              )}
            >
              {v} días
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tabla tipo="secado" alertas={alertas.filter((a) => a.tipo === "secado")} />
        <Tabla tipo="parto" alertas={alertas.filter((a) => a.tipo === "parto")} />
      </div>
    </div>
  );
}
