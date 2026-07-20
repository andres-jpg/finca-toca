"use client";

import { useEffect, useState, useTransition } from "react";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Loader2, ListChecks } from "lucide-react";
import { DatePicker } from "@/components/shared/date-picker";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getEstadoItinerarioPorFecha,
  type EstadoItinerarioResult,
} from "@/features/itinerarios/actions/itinerarios.actions";

interface EstadoItinerarioPanelProps {
  itinerarios: { id: number; nombre: string }[];
}

export function EstadoItinerarioPanel({ itinerarios }: EstadoItinerarioPanelProps) {
  const [itinerarioId, setItinerarioId] = useState<string>(
    itinerarios[0] ? String(itinerarios[0].id) : "",
  );
  const [fecha, setFecha] = useState<Date>(new Date());
  const [resultado, setResultado] = useState<EstadoItinerarioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!itinerarioId) return;
    const fechaIso = format(fecha, "yyyy-MM-dd");
    startTransition(async () => {
      setError(null);
      try {
        const data = await getEstadoItinerarioPorFecha(parseInt(itinerarioId, 10), fechaIso);
        setResultado(data);
      } catch (err) {
        setResultado(null);
        setError(err instanceof Error ? err.message : "Error al consultar el estado");
      }
    });
  }, [itinerarioId, fecha]);

  if (itinerarios.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <ListChecks className="h-5 w-5" style={{ color: "#0d9488" }} />
        <h3 className="text-sm font-semibold text-stone-800">Estado de itinerario por fecha</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Itinerario</p>
          <Select value={itinerarioId} onValueChange={setItinerarioId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un itinerario" />
            </SelectTrigger>
            <SelectContent>
              {itinerarios.map((it) => (
                <SelectItem key={it.id} value={String(it.id)}>
                  {it.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">Fecha</p>
          <DatePicker value={fecha} onChange={setFecha} disableFuture />
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 text-sm text-stone-500 py-4 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Consultando…
        </div>
      )}

      {!isPending && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!isPending && !error && resultado && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-stone-600">
              <span className="font-semibold text-stone-800">{resultado.visitadas.length}</span>
              {" / "}
              {resultado.total} fincas visitadas
            </p>
            {resultado.total === 0 ? (
              <Badge variant="outline" className="bg-stone-100 text-stone-600 border-stone-200">
                Sin fincas asignadas
              </Badge>
            ) : resultado.completado ? (
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ruta completada
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                <XCircle className="h-3.5 w-3.5" />
                Ruta incompleta
              </Badge>
            )}
          </div>

          {resultado.faltantes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Fincas sin visitar ({resultado.faltantes.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {resultado.faltantes.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 text-xs"
                  >
                    {f.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}

          {resultado.visitadas.length > 0 && (
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-1.5">
                Fincas visitadas ({resultado.visitadas.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {resultado.visitadas.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 text-xs"
                  >
                    {f.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
