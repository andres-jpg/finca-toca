"use client";

import { useState } from "react";
import { BellRing, CheckCircle2, ChevronDown } from "lucide-react";
import { AlertaItem } from "@/features/alertas/components/alerta-item";
import { ALERTA_CONFIG, agruparPorTipo } from "@/features/alertas/components/alerta-config";
import { cn } from "@/lib/utils";
import type { Alerta, TipoAlerta } from "@/types";

export function AlertasCard({
  alertas,
  canEdit = false,
}: {
  alertas: Alerta[];
  canEdit?: boolean;
}) {
  const vencidas = alertas.filter((a) => a.severidad === "vencida").length;
  const grupos = agruparPorTipo(alertas);
  // Colapsados por defecto: con muchas alertas pendientes la tarjeta solo lista los
  // tipos con su conteo, y cada uno se despliega a mano al hacer click.
  const [abiertos, setAbiertos] = useState<Set<TipoAlerta>>(new Set());

  const toggle = (tipo: TipoAlerta) => {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });
  };

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
            {grupos.map((grupo) => {
              const config = ALERTA_CONFIG[grupo.tipo];
              const Icon = config.icon;
              const abierto = abiertos.has(grupo.tipo);
              const vencidasGrupo = grupo.alertas.filter((a) => a.severidad === "vencida").length;
              const hoyGrupo = grupo.alertas.filter((a) => a.severidad === "hoy").length;

              return (
                <div key={grupo.tipo} className="py-1 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => toggle(grupo.tipo)}
                    aria-expanded={abierto}
                    className="w-full flex items-center gap-3 py-2 px-2 -mx-2 text-left rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: config.bg }}
                    >
                      <Icon className="h-4 w-4" style={{ color: config.color }} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-stone-800">{config.label}</span>
                      {vencidasGrupo > 0 ? (
                        <span className="ml-2 text-xs font-medium text-red-600">
                          {vencidasGrupo} vencida{vencidasGrupo === 1 ? "" : "s"}
                        </span>
                      ) : (
                        hoyGrupo > 0 && (
                          <span className="ml-2 text-xs font-medium text-amber-600">
                            {hoyGrupo} hoy
                          </span>
                        )
                      )}
                    </div>

                    <span className="text-xs font-semibold text-stone-400 shrink-0">
                      {grupo.alertas.length}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-stone-400 shrink-0 transition-transform",
                        abierto && "rotate-180"
                      )}
                    />
                  </button>

                  {abierto && (
                    <div className="pl-11 divide-y divide-stone-50">
                      {grupo.alertas.map((alerta) => (
                        <AlertaItem key={alerta.id} alerta={alerta} canEdit={canEdit} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
