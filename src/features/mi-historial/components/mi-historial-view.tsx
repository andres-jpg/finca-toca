"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WifiOff, Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useOnline } from "@/hooks/useOnline";
import { getMisRecolecciones } from "@/features/recolecciones/actions/recolecciones.actions";
import { getMisPagos } from "@/features/pagos-cooperativa/actions/pagos.actions";
import type { Recoleccion, PagoFinca } from "@/types";

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  pagado: { label: "Pagado", className: "bg-green-100 text-green-800 border-green-200" },
  punto_venta: { label: "Punto de venta", className: "bg-blue-100 text-blue-800 border-blue-200" },
  devuelto: { label: "No asignado", className: "bg-red-100 text-red-800 border-red-200" },
};

function fmtDate(s: string) {
  return format(new Date(s + "T12:00:00"), "d MMM", { locale: es });
}

type Tab = "recolecciones" | "pagos";

export function MiHistorialView() {
  const isOnline = useOnline();
  const [tab, setTab] = useState<Tab>("recolecciones");
  const [recolecciones, setRecolecciones] = useState<Recoleccion[] | null>(null);
  const [pagos, setPagos] = useState<PagoFinca[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filterFincaId, setFilterFincaId] = useState<string>("todas");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [recs, pgs] = await Promise.all([getMisRecolecciones(), getMisPagos()]);
      setRecolecciones(recs);
      setPagos(pgs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOnline) cargar();
  }, [isOnline, cargar]);

  const fincasOptions = useMemo(() => {
    const map = new Map<number, string>();
    (recolecciones ?? []).forEach((r) => {
      if (r.finca_id && r.finca_nombre) map.set(r.finca_id, r.finca_nombre);
    });
    (pagos ?? []).forEach((p) => {
      if (p.finca_id && p.finca_nombre) map.set(p.finca_id, p.finca_nombre);
    });
    return Array.from(map.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [recolecciones, pagos]);

  const recoleccionesFiltradas = useMemo(() => {
    if (!recolecciones) return [];
    if (filterFincaId === "todas") return recolecciones;
    const fid = Number(filterFincaId);
    return recolecciones.filter((r) => r.finca_id === fid);
  }, [recolecciones, filterFincaId]);

  const pagosFiltrados = useMemo(() => {
    if (!pagos) return [];
    if (filterFincaId === "todas") return pagos;
    const fid = Number(filterFincaId);
    return pagos.filter((p) => p.finca_id === fid);
  }, [pagos, filterFincaId]);

  if (!isOnline) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center gap-3 px-4">
        <WifiOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-base font-semibold text-gray-700">Sin conexión a internet</p>
        <p className="text-sm text-gray-500 max-w-sm">
          Este módulo necesita conexión para funcionar. Conéctate a internet e inténtalo de nuevo.
        </p>
      </div>
    );
  }

  if (loading && recolecciones === null && pagos === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Cargando historial...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center gap-3 px-4">
        <WifiOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-base font-semibold text-gray-700">No se pudo cargar el historial</p>
        <p className="text-sm text-gray-500 max-w-sm">
          Revisa tu conexión e inténtalo de nuevo.
        </p>
        <Button onClick={cargar} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  const totalLitros = recoleccionesFiltradas.reduce((sum, r) => sum + r.litros, 0);

  return (
    <div className="max-w-md mx-auto space-y-4 pb-8">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Conductor</p>
        <h2 className="text-lg font-semibold">Mi historial (últimos 15 días)</h2>
      </div>

      {/* Selector de Finca */}
      <div className="flex items-center justify-between gap-2 bg-card p-3 border rounded-xl shadow-sm">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Finca:
        </span>
        <Select value={filterFincaId} onValueChange={setFilterFincaId}>
          <SelectTrigger className="h-8 text-xs w-48 bg-background">
            <SelectValue placeholder="Todas las fincas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las fincas</SelectItem>
            {fincasOptions.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setTab("recolecciones")}
          className={cn(
            "rounded-md py-2 text-sm font-medium transition-colors",
            tab === "recolecciones" ? "bg-background shadow-sm" : "text-muted-foreground"
          )}
        >
          Recolecciones ({recoleccionesFiltradas.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("pagos")}
          className={cn(
            "rounded-md py-2 text-sm font-medium transition-colors",
            tab === "pagos" ? "bg-background shadow-sm" : "text-muted-foreground"
          )}
        >
          Pagos ({pagosFiltrados.length})
        </button>
      </div>

      {tab === "recolecciones" ? (
        <div className="space-y-3">
          <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-teal-600">
                {totalLitros.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                <span className="ml-1 text-base font-normal text-muted-foreground">L</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">total recolectado</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{recoleccionesFiltradas.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">registros</p>
            </div>
          </div>

          {recoleccionesFiltradas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {filterFincaId !== "todas"
                ? "Sin recolecciones para esta finca en los últimos 15 días."
                : "Sin recolecciones en los últimos 15 días."}
            </p>
          ) : (
            <div className="space-y-2">
              {recoleccionesFiltradas.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border bg-card px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.finca_nombre}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(r.fecha)}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0">
                    {r.litros.toLocaleString("es-CO", { maximumFractionDigits: 1 })} L
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {pagosFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {filterFincaId !== "todas"
                ? "Sin pagos para esta finca en los últimos 15 días."
                : "Sin pagos en los últimos 15 días."}
            </p>
          ) : (
            pagosFiltrados.map((p) => {
              const badge = ESTADO_BADGE[p.estado];
              return (
                <div key={p.id} className="rounded-lg border bg-card px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{p.finca_nombre}</p>
                    <Badge variant="outline" className={badge?.className}>
                      {badge?.label ?? p.estado}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {fmtDate(p.fecha_inicio)} – {fmtDate(p.fecha_fin)}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">
                      {p.litros.toLocaleString("es-CO", { maximumFractionDigits: 1 })} L
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
