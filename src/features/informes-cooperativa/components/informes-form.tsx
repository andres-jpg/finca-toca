"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Download, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FincaCombobox } from "@/components/shared/finca-combobox";
import { DatePicker } from "@/components/shared/date-picker";
import type { FincaCooperativa, Itinerario, RutaCooperativa } from "@/types";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface InformesFormProps {
  fincas: FincaCooperativa[];
  rutas: RutaCooperativa[];
  itinerarios: Itinerario[];
}

export function InformesForm({ fincas, rutas, itinerarios }: InformesFormProps) {
  const now = new Date();
  const [tipo, setTipo] = useState<"finca" | "ruta" | "itinerario" | "general">("finca");
  const [fincaId, setFincaId] = useState<number | null>(fincas[0]?.id ?? null);
  const [rutaId, setRutaId] = useState<string>(rutas[0]?.id?.toString() ?? "");
  const [itinerarioId, setItinerarioId] = useState<string>(itinerarios[0]?.id?.toString() ?? "");
  const [mes, setMes] = useState<string>(String(now.getMonth() + 1));
  const [anio, setAnio] = useState<string>(String(now.getFullYear()));
  const [quincena, setQuincena] = useState<"1" | "2" | "custom">("1");
  const [fechaDesde, setFechaDesde] = useState<Date | undefined>();
  const [fechaHasta, setFechaHasta] = useState<Date | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingComp, setLoadingComp] = useState(false);

  function buildCommonParams() {
    const id =
      tipo === "finca"
        ? fincaId !== null ? String(fincaId) : ""
        : tipo === "ruta"
        ? rutaId
        : tipo === "itinerario"
        ? itinerarioId
        : null;
    return { id };
  }

  function nombreLabel() {
    if (tipo === "general") return "General";
    if (tipo === "finca") return fincas.find((f) => f.id === fincaId)?.nombre ?? String(fincaId);
    if (tipo === "ruta") return rutas.find((r) => r.id.toString() === rutaId)?.nombre ?? rutaId;
    return itinerarios.find((it) => it.id.toString() === itinerarioId)?.nombre ?? itinerarioId;
  }

  function buildPeriodoParams(params: URLSearchParams) {
    if (quincena === "custom") {
      if (!fechaDesde || !fechaHasta) {
        toast.error("Selecciona fecha inicio y fecha fin");
        return false;
      }
      if (fechaDesde > fechaHasta) {
        toast.error("La fecha inicio debe ser anterior a la fecha fin");
        return false;
      }
      params.set("fechaDesde", format(fechaDesde, "yyyy-MM-dd"));
      params.set("fechaHasta", format(fechaHasta, "yyyy-MM-dd"));
    } else {
      if (!mes || !anio) { toast.error("Selecciona mes y año"); return false; }
      params.set("quincena", quincena);
      params.set("mes", mes);
      params.set("anio", anio);
    }
    return true;
  }

  function buildFilename(prefix: string, ext: string) {
    const label = nombreLabel();
    if (quincena === "custom" && fechaDesde && fechaHasta) {
      return `${prefix}_${format(fechaDesde, "yyyy-MM-dd")}_${format(fechaHasta, "yyyy-MM-dd")}_${label}.${ext}`;
    }
    return `${prefix}_Q${quincena}_${MESES[parseInt(mes) - 1]}_${anio}_${label}.${ext}`;
  }

  const handleDownload = async () => {
    const { id } = buildCommonParams();
    if (tipo !== "general" && !id) { toast.error("Selecciona una finca, ruta o itinerario"); return; }

    const params = new URLSearchParams({ tipo });
    if (id) params.set("id", id);
    if (!buildPeriodoParams(params)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/informes-cooperativa?${params}`);
      if (!res.ok) throw new Error((await res.text()) || "Error al generar el informe");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildFilename("informe", "xlsx");
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Informe descargado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar el informe");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadComprobantes = async () => {
    const { id } = buildCommonParams();
    if (tipo !== "general" && !id) { toast.error("Selecciona una finca, ruta o itinerario"); return; }

    const params = new URLSearchParams({ tipo });
    if (id) params.set("id", id);
    if (!buildPeriodoParams(params)) return;

    setLoadingComp(true);
    try {
      const res = await fetch(`/api/comprobantes-pago?${params}`);
      if (!res.ok) throw new Error((await res.text()) || "Error al generar los comprobantes");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildFilename("comprobantes", "xlsx");
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Comprobantes descargados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar los comprobantes");
    } finally {
      setLoadingComp(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm max-w-lg space-y-5">
      {/* Tipo */}
      <div>
        <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Tipo de informe</p>
        <div className="flex flex-wrap gap-2">
          {(["finca", "ruta", "itinerario", "general"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                tipo === t
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-stone-600 border-stone-200 hover:border-teal-300"
              }`}
            >
              {t === "finca"
                ? "Finca individual"
                : t === "ruta"
                ? "Ruta"
                : t === "itinerario"
                ? "Itinerario"
                : "Informe general"}
            </button>
          ))}
        </div>
      </div>

      {/* Selector finca, ruta o itinerario */}
      {tipo !== "general" && (
        <div>
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
            {tipo === "finca" ? "Finca" : tipo === "ruta" ? "Ruta" : "Itinerario"}
          </p>
          {tipo === "finca" ? (
            fincas.length === 0 ? (
              <p className="text-sm text-stone-400 italic">Sin fincas activas</p>
            ) : (
              <FincaCombobox fincas={fincas} value={fincaId} onChange={setFincaId} />
            )
          ) : tipo === "ruta" ? (
            <select
              value={rutaId}
              onChange={(e) => setRutaId(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {rutas.length === 0 && <option value="">Sin rutas</option>}
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre} ({r.fincas.length} finca{r.fincas.length !== 1 ? "s" : ""})
                </option>
              ))}
            </select>
          ) : (
            <select
              value={itinerarioId}
              onChange={(e) => setItinerarioId(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {itinerarios.length === 0 && <option value="">Sin itinerarios</option>}
              {itinerarios.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.nombre} ({it.fincas.length} finca{it.fincas.length !== 1 ? "s" : ""})
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {tipo === "general" && (
        <p className="text-sm text-stone-500 italic">
          Incluye todas las rutas y sus fincas, agrupadas por ruta.
        </p>
      )}

      {/* Mes y año — solo visible cuando quincena no es custom */}
      {quincena !== "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Mes</p>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {MESES.map((nombre, i) => (
                <option key={i + 1} value={i + 1}>{nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Año</p>
            <input
              type="number"
              value={anio}
              onChange={(e) => setAnio(e.target.value)}
              min={2020}
              max={2099}
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      )}

      {/* Período */}
      <div>
        <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Quincena</p>
        <div className="flex gap-2">
          {(["1", "2", "custom"] as const).map((q) => (
            <button
              key={q}
              onClick={() => setQuincena(q)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                quincena === q
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-stone-600 border-stone-200 hover:border-teal-300"
              }`}
            >
              {q === "1" ? "Q1 (días 1–15)" : q === "2" ? "Q2 (día 16–fin)" : "Rango libre"}
            </button>
          ))}
        </div>

        {/* DatePickers — solo visibles en modo rango libre */}
        {quincena === "custom" && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Desde</p>
              <DatePicker
                value={fechaDesde}
                onChange={setFechaDesde}
                placeholder="Fecha inicio"
                fromYear={2020}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Hasta</p>
              <DatePicker
                value={fechaHasta}
                onChange={setFechaHasta}
                placeholder="Fecha fin"
                fromYear={2020}
              />
            </div>
          </div>
        )}
      </div>

      {/* Botones */}
      <div className="flex flex-col gap-2">
        <Button
          onClick={handleDownload}
          disabled={loading || loadingComp}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generando informe…</>
          ) : (
            <><Download className="h-4 w-4 mr-2" />Descargar informe Excel</>
          )}
        </Button>

        <Button
          onClick={handleDownloadComprobantes}
          disabled={loading || loadingComp}
          variant="outline"
          className="w-full border-teal-600 text-teal-700 hover:bg-teal-50"
        >
          {loadingComp ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generando comprobantes…</>
          ) : (
            <><Ticket className="h-4 w-4 mr-2" />Descargar comprobantes de pago</>
          )}
        </Button>
      </div>
    </div>
  );
}
