"use client";

import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { MonthPicker } from "@/components/shared/month-picker";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { cn } from "@/lib/utils";

export type PeriodoFiltro = { tipo: "mes"; mes: Date } | { tipo: "rango"; desde: Date; hasta: Date };

function inicioDeMes(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Compara directamente sobre el string ISO "yyyy-MM-dd" tal como se guarda en la
 * base (evita reconstruir un Date solo para filtrar, y el desfase de zona horaria
 * que eso traería en Vercel/UTC frente al navegador).
 */
export function fechaEnPeriodo(fechaISO: string, periodo: PeriodoFiltro): boolean {
  if (periodo.tipo === "mes") {
    const prefix = `${periodo.mes.getFullYear()}-${String(periodo.mes.getMonth() + 1).padStart(2, "0")}`;
    return fechaISO.startsWith(prefix);
  }
  const desde = format(periodo.desde, "yyyy-MM-dd");
  const hasta = format(periodo.hasta, "yyyy-MM-dd");
  return fechaISO >= desde && fechaISO <= hasta;
}

interface PeriodoFiltroControlProps {
  value: PeriodoFiltro;
  onChange: (value: PeriodoFiltro) => void;
}

export function PeriodoFiltroControl({ value, onChange }: PeriodoFiltroControlProps) {
  const setTipo = (tipo: PeriodoFiltro["tipo"]) => {
    if (tipo === value.tipo) return;
    if (tipo === "mes") {
      onChange({ tipo: "mes", mes: value.tipo === "rango" ? value.hasta : new Date() });
      return;
    }
    // Al pasar de "mes" a "rango" se arranca en ese mismo mes, no en un rango vacío.
    const desde = value.tipo === "mes" ? inicioDeMes(value.mes) : value.desde;
    const hasta = value.tipo === "mes" ? new Date() : value.hasta;
    onChange({ tipo: "rango", desde, hasta });
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500 shrink-0">
        <CalendarDays className="h-4 w-4" />
        <span className="text-sm font-medium">Filtrar por</span>
      </div>
      <div className="h-4 w-px bg-gray-200 hidden sm:block" />

      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 shrink-0">
        <button
          type="button"
          onClick={() => setTipo("mes")}
          className={cn(
            "px-3 py-1 text-sm font-medium rounded-md transition-colors",
            value.tipo === "mes" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700",
          )}
        >
          Mes
        </button>
        <button
          type="button"
          onClick={() => setTipo("rango")}
          className={cn(
            "px-3 py-1 text-sm font-medium rounded-md transition-colors",
            value.tipo === "rango" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700",
          )}
        >
          Rango
        </button>
      </div>

      <div className="h-4 w-px bg-gray-200 hidden sm:block" />

      {value.tipo === "mes" ? (
        <MonthPicker value={value.mes} onChange={(mes) => onChange({ tipo: "mes", mes })} />
      ) : (
        <DateRangePicker
          from={value.desde}
          to={value.hasta}
          onChange={({ from, to }) => onChange({ tipo: "rango", desde: from, hasta: to })}
        />
      )}
    </div>
  );
}
