"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityModal } from "@/components/shared/entity-modal";
import { FincaCombobox } from "@/components/shared/finca-combobox";
import { MonthPicker } from "@/components/shared/month-picker";
import { DatePicker } from "@/components/shared/date-picker";
import { RecoleccionForm } from "@/features/recolecciones/components/recoleccion-form";
import { RecoleccionesResumen } from "@/features/recolecciones/components/recolecciones-resumen";
import { RecoleccionesTable } from "@/features/recolecciones/components/recolecciones-table";
import { formatDate } from "@/lib/utils";
import type { Recoleccion, FincaCooperativa, RutaCooperativa, Itinerario } from "@/types";

function getMonthRange(year: number, month: number) {
  const start = formatDate(new Date(year, month - 1, 1));
  const end = formatDate(new Date(year, month, 0));
  return { start, end };
}

interface RecoleccionesViewProps {
  recolecciones: Recoleccion[];
  fincas: FincaCooperativa[];
  rutas: RutaCooperativa[];
  itinerarios: Itinerario[];
  desde: string;
  hasta: string;
  canEdit: boolean;
  canDelete: boolean;
}

export function RecoleccionesView({
  recolecciones,
  fincas,
  rutas,
  itinerarios,
  desde,
  hasta,
  canEdit,
  canDelete,
}: RecoleccionesViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [tab, setTab] = useState<"resumen" | "detalle">("resumen");
  const [modalOpen, setModalOpen] = useState(false);

  const [periodMode, setPeriodMode] = useState<"mes" | "rango">("mes");
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(desde + "T00:00:00"));
  const [fechaDesde, setFechaDesde] = useState<Date | undefined>(
    () => new Date(desde + "T00:00:00")
  );
  const [fechaHasta, setFechaHasta] = useState<Date | undefined>(
    () => new Date(hasta + "T00:00:00")
  );
  const rangoInvalido = Boolean(fechaDesde && fechaHasta && fechaDesde > fechaHasta);

  const [fincaId, setFincaId] = useState<number | null>(null);
  const [rutaId, setRutaId] = useState<number | null>(null);
  const [itinerarioId, setItinerarioId] = useState<number | null>(null);

  function pushRange(newDesde: string, newHasta: string) {
    const params = new URLSearchParams();
    params.set("desde", newDesde);
    params.set("hasta", newHasta);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleMonthChange(date: Date) {
    setSelectedMonth(date);
    const { start, end } = getMonthRange(date.getFullYear(), date.getMonth() + 1);
    pushRange(start, end);
  }

  function handleRangoChange(next: { desde?: Date; hasta?: Date }) {
    const nextDesde = next.desde ?? fechaDesde;
    const nextHasta = next.hasta ?? fechaHasta;
    setFechaDesde(nextDesde);
    setFechaHasta(nextHasta);
    if (nextDesde && nextHasta && nextDesde <= nextHasta) {
      pushRange(formatDate(nextDesde), formatDate(nextHasta));
    }
  }

  const filtered = useMemo(() => {
    return recolecciones.filter((r) => {
      if (fincaId !== null && r.finca_id !== fincaId) return false;
      if (rutaId !== null && r.ruta_id !== rutaId) return false;
      if (itinerarioId !== null && r.itinerario_id !== itinerarioId) return false;
      return true;
    });
  }, [recolecciones, fincaId, rutaId, itinerarioId]);

  const hasEntityFilters = fincaId !== null || rutaId !== null || itinerarioId !== null;

  function clearEntityFilters() {
    setFincaId(null);
    setRutaId(null);
    setItinerarioId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">
            Recolecciones
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length.toLocaleString("es-CO")} registro(s) en el período seleccionado
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva recolección
          </Button>
        )}
      </div>

      {/* Filtros compartidos */}
      <div className="flex flex-col gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setPeriodMode("mes")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                periodMode === "mes"
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"
              }`}
            >
              Por mes
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode("rango")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                periodMode === "rango"
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"
              }`}
            >
              Rango libre
            </button>
          </div>

          {periodMode === "mes" ? (
            <MonthPicker value={selectedMonth} onChange={handleMonthChange} />
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="w-40">
                  <DatePicker
                    value={fechaDesde}
                    onChange={(d) => handleRangoChange({ desde: d })}
                    placeholder="Desde"
                    disableFuture
                  />
                </div>
                <div className="w-40">
                  <DatePicker
                    value={fechaHasta}
                    onChange={(d) => handleRangoChange({ hasta: d })}
                    placeholder="Hasta"
                    disableFuture
                  />
                </div>
              </div>
              {rangoInvalido && (
                <span className="text-xs text-red-500">
                  La fecha inicio debe ser anterior a la fecha fin
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-3 border-t border-gray-100">
          <div className="w-full sm:w-56">
            <FincaCombobox
              fincas={fincas}
              value={fincaId}
              onChange={(id) => setFincaId(id)}
              placeholder="Todas las fincas"
            />
          </div>

          <Select
            value={rutaId !== null ? String(rutaId) : "all"}
            onValueChange={(v) => setRutaId(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="w-full sm:w-48 bg-white">
              <SelectValue placeholder="Todas las rutas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las rutas</SelectItem>
              {rutas.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={itinerarioId !== null ? String(itinerarioId) : "all"}
            onValueChange={(v) => setItinerarioId(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="w-full sm:w-52 bg-white">
              <SelectValue placeholder="Todos los itinerarios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los itinerarios</SelectItem>
              {itinerarios.map((it) => (
                <SelectItem key={it.id} value={String(it.id)}>
                  {it.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasEntityFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearEntityFilters}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab("resumen")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "resumen"
              ? "border-teal-600 text-teal-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Resumen
        </button>
        <button
          type="button"
          onClick={() => setTab("detalle")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "detalle"
              ? "border-teal-600 text-teal-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Detalle
        </button>
      </div>

      {tab === "resumen" ? (
        <RecoleccionesResumen recolecciones={filtered} />
      ) : (
        <RecoleccionesTable
          recolecciones={filtered}
          fincas={fincas}
          rutas={rutas}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}

      {canEdit && (
        <EntityModal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva recolección">
          <RecoleccionForm
            fincas={fincas}
            rutas={rutas}
            lockDate={false}
            showPricing={true}
            onSuccess={() => setModalOpen(false)}
          />
        </EntityModal>
      )}
    </div>
  );
}
