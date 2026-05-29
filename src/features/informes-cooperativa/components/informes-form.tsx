"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FincaCombobox } from "@/components/shared/finca-combobox";
import type { FincaCooperativa, RutaCooperativa } from "@/types";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface InformesFormProps {
  fincas: FincaCooperativa[];
  rutas: RutaCooperativa[];
}

export function InformesForm({ fincas, rutas }: InformesFormProps) {
  const now = new Date();
  const [tipo, setTipo] = useState<"finca" | "ruta" | "general">("finca");
  const [fincaId, setFincaId] = useState<number | null>(fincas[0]?.id ?? null);
  const [rutaId, setRutaId] = useState<string>(rutas[0]?.id?.toString() ?? "");
  const [mes, setMes] = useState<string>(String(now.getMonth() + 1));
  const [anio, setAnio] = useState<string>(String(now.getFullYear()));
  const [quincena, setQuincena] = useState<"1" | "2">("1");
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    const id = tipo === "finca" ? (fincaId !== null ? String(fincaId) : "") : tipo === "ruta" ? rutaId : null;
    if (tipo !== "general" && !id) {
      toast.error("Selecciona una finca o ruta");
      return;
    }
    if (!mes || !anio) {
      toast.error("Selecciona mes y año");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ tipo, mes, anio, quincena });
      if (id) params.set("id", id);
      const res = await fetch(`/api/informes-cooperativa?${params}`);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Error al generar el informe");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const nombreLabel =
        tipo === "general"
          ? "General"
          : tipo === "finca"
          ? fincas.find((f) => f.id === fincaId)?.nombre ?? String(fincaId)
          : rutas.find((r) => r.id.toString() === rutaId)?.nombre ?? rutaId;
      a.href = url;
      a.download = `informe_Q${quincena}_${MESES[parseInt(mes) - 1]}_${anio}_${nombreLabel}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Informe descargado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar el informe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm max-w-lg space-y-5">
      {/* Tipo */}
      <div>
        <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Tipo de informe</p>
        <div className="flex gap-2">
          {(["finca", "ruta", "general"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                tipo === t
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-stone-600 border-stone-200 hover:border-teal-300"
              }`}
            >
              {t === "finca" ? "Finca individual" : t === "ruta" ? "Ruta (todas sus fincas)" : "Informe general"}
            </button>
          ))}
        </div>
      </div>

      {/* Selector finca o ruta (oculto en modo general) */}
      {tipo !== "general" && (
        <div>
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
            {tipo === "finca" ? "Finca" : "Ruta"}
          </p>
          {tipo === "finca" ? (
            fincas.length === 0 ? (
              <p className="text-sm text-stone-400 italic">Sin fincas activas</p>
            ) : (
              <FincaCombobox
                fincas={fincas}
                value={fincaId}
                onChange={setFincaId}
              />
            )
          ) : (
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
          )}
        </div>
      )}
      {tipo === "general" && (
        <p className="text-sm text-stone-500 italic">
          Incluye todas las rutas y sus fincas, agrupadas por ruta.
        </p>
      )}

      {/* Mes y año */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Mes</p>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {MESES.map((nombre, i) => (
              <option key={i + 1} value={i + 1}>
                {nombre}
              </option>
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

      {/* Quincena */}
      <div>
        <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Quincena</p>
        <div className="flex gap-2">
          {(["1", "2"] as const).map((q) => (
            <button
              key={q}
              onClick={() => setQuincena(q)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                quincena === q
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-stone-600 border-stone-200 hover:border-teal-300"
              }`}
            >
              {q === "1" ? "Q1 (días 1–15)" : "Q2 (día 16–fin)"}
            </button>
          ))}
        </div>
      </div>

      {/* Botón */}
      <Button
        onClick={handleDownload}
        disabled={loading}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generando informe…
          </>
        ) : (
          <>
            <Download className="h-4 w-4 mr-2" />
            Descargar Excel
          </>
        )}
      </Button>
    </div>
  );
}
