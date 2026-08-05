import { BellRing, CheckCircle2 } from "lucide-react";
import { AlertaItem } from "@/features/alertas/components/alerta-item";
import {
  SEVERIDAD_LABELS,
  agruparPorSeveridad,
} from "@/features/alertas/components/alerta-config";
import type { Alerta } from "@/types";

export function AlertasCard({
  alertas,
  canEdit = false,
}: {
  alertas: Alerta[];
  canEdit?: boolean;
}) {
  const vencidas = alertas.filter((a) => a.severidad === "vencida").length;
  const grupos = agruparPorSeveridad(alertas);

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm flex flex-col flex-1 w-full h-full min-h-0 overflow-hidden">
      <div className="flex items-start justify-between shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">
            Alertas del hato
          </p>
          <p className="text-2xl font-bold text-stone-900 mt-1.5">
            {alertas.length}
            {vencidas > 0 && (
              <span className="text-sm font-medium ml-2" style={{ color: "#ef4444" }}>
                {vencidas} vencida{vencidas === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ml-3"
          style={{ backgroundColor: alertas.length > 0 ? "#fef2f2" : "#f0fdf4" }}
        >
          <BellRing
            className="h-5 w-5"
            style={{ color: alertas.length > 0 ? "#ef4444" : "#16a34a" }}
          />
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-stone-100 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {alertas.length === 0 ? (
          <div className="flex items-center gap-2 py-2 justify-center text-stone-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-xs">Nada pendiente</span>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {grupos.map((grupo) => (
              <div key={grupo.severidad} className="py-1 first:pt-0 last:pb-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 pt-2">
                  {SEVERIDAD_LABELS[grupo.severidad]}
                </p>
                <div className="divide-y divide-stone-50">
                  {grupo.alertas.map((alerta) => (
                    <AlertaItem key={alerta.id} alerta={alerta} canEdit={canEdit} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
