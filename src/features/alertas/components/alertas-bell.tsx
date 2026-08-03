"use client";

import { useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertaItem } from "@/features/alertas/components/alerta-item";
import {
  SEVERIDAD_LABELS,
  agruparPorSeveridad,
} from "@/features/alertas/components/alerta-config";
import type { Alerta } from "@/types";

export function AlertasBell({
  alertas,
  canEdit = false,
}: {
  alertas: Alerta[];
  canEdit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const grupos = agruparPorSeveridad(alertas);
  const vencidas = alertas.filter((a) => a.severidad === "vencida").length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            alertas.length === 0
              ? "Sin alertas pendientes"
              : `${alertas.length} alertas pendientes`
          }
          className="relative p-2 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
        >
          <Bell className="h-[18px] w-[18px]" />
          {alertas.length > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ backgroundColor: vencidas > 0 ? "#ef4444" : "#d97706" }}
            >
              {alertas.length > 99 ? "99+" : alertas.length}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] p-0 max-h-[70vh] overflow-y-auto"
      >
        <div className="px-4 py-3 border-b border-stone-100 sticky top-0 bg-white z-10">
          <p className="text-sm font-semibold text-stone-800">Alertas</p>
          <p className="text-xs text-stone-400">
            {alertas.length === 0
              ? "Vencidas y próximos 7 días"
              : `${alertas.length} pendiente${alertas.length === 1 ? "" : "s"} · vencidas y próximos 7 días`}
          </p>
        </div>

        {alertas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-stone-400">
            <CheckCircle2 className="h-6 w-6" />
            <span className="text-sm">Todo al día</span>
          </div>
        ) : (
          <div className="px-4 pb-2">
            {grupos.map((grupo) => (
              <div key={grupo.severidad}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 pt-3">
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
      </PopoverContent>
    </Popover>
  );
}
