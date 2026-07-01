"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/shared/date-picker";
import { getFincasConLitrosPorRuta, activarPago } from "../actions/pagos.actions";
import type { RutaCooperativa } from "@/types";
import type { ItinerarioGroup, FincaConLitros } from "../schemas/pago.schema";

interface FincaRow extends FincaConLitros {
  incluida: boolean;
  responsableOverride: "conductor" | "punto_venta" | "gerente";
}

interface ItinerarioCard {
  group: ItinerarioGroup;
  filas: FincaRow[];
  activado: boolean;
}

interface ActivarPagoPanelProps {
  rutas: RutaCooperativa[];
}

function formatFecha(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parseInt(d)} ${meses[parseInt(m) - 1]}`;
}

const RESPONSABLE_LABELS: Record<string, string> = {
  conductor: "Conductor",
  punto_venta: "Punto de venta",
  gerente: "Gerente",
};

export function ActivarPagoPanel({ rutas }: ActivarPagoPanelProps) {
  const [rutaId, setRutaId] = useState<number | null>(null);
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>();
  const [fechaFin, setFechaFin] = useState<Date | undefined>();
  const [cards, setCards] = useState<ItinerarioCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toISO = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);

  const handleBuscar = async () => {
    if (!rutaId || !fechaInicio || !fechaFin) return;
    setIsLoading(true);
    setCards([]);
    try {
      const groups = await getFincasConLitrosPorRuta(
        rutaId,
        toISO(fechaInicio),
        toISO(fechaFin)
      );
      setCards(
        groups.map((g) => ({
          group: g,
          filas: g.fincas.map((f) => ({
            ...f,
            incluida: f.metodo_pago !== "gerente",
            responsableOverride: f.metodo_pago,
          })),
          activado: false,
        }))
      );
      if (groups.length === 0) toast.info("No hay fincas con recolecciones en ese período");
    } catch {
      toast.error("Error al cargar las fincas");
    } finally {
      setIsLoading(false);
    }
  };

  const updateFila = (
    cardIdx: number,
    fincaId: number,
    patch: Partial<Pick<FincaRow, "incluida" | "responsableOverride">>
  ) => {
    setCards((prev) =>
      prev.map((card, ci) => {
        if (ci !== cardIdx) return card;
        return {
          ...card,
          filas: card.filas.map((f) => (f.finca_id === fincaId ? { ...f, ...patch } : f)),
        };
      })
    );
  };

  const handleActivar = (cardIdx: number) => {
    const card = cards[cardIdx];
    const included = card.filas.filter((f) => f.incluida);
    if (included.length === 0) {
      toast.error("Selecciona al menos una finca");
      return;
    }
    startTransition(async () => {
      try {
        await activarPago(
          included.map((f) => ({
            finca_id: f.finca_id,
            itinerario_id: card.group.itinerario_id,
            litros: f.litros,
            responsable: f.responsableOverride,
          })),
          toISO(fechaInicio!),
          toISO(fechaFin!)
        );
        setCards((prev) =>
          prev.map((c, ci) => (ci === cardIdx ? { ...c, activado: true } : c))
        );
        toast.success(`Pago activado para ${included.length} finca(s)`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al activar el pago");
      }
    });
  };

  const periodoLabel =
    fechaInicio && fechaFin
      ? `${formatFecha(toISO(fechaInicio))} → ${formatFecha(toISO(fechaFin))}`
      : "";

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-semibold text-sm">Seleccionar ruta y período</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ruta</Label>
            <Select
              value={rutaId ? String(rutaId) : ""}
              onValueChange={(v) => {
                setRutaId(parseInt(v));
                setCards([]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar ruta" />
              </SelectTrigger>
              <SelectContent>
                {rutas.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fecha inicio</Label>
            <DatePicker
              value={fechaInicio}
              onChange={(d) => { setFechaInicio(d); setCards([]); }}
              placeholder="Inicio del período"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fecha fin</Label>
            <DatePicker
              value={fechaFin}
              onChange={(d) => { setFechaFin(d); setCards([]); }}
              placeholder="Fin del período"
            />
          </div>
        </div>

        <Button
          onClick={handleBuscar}
          disabled={!rutaId || !fechaInicio || !fechaFin || isLoading}
          variant="outline"
          className="w-full sm:w-auto"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculando litros...
            </>
          ) : (
            "Ver fincas del período"
          )}
        </Button>
      </div>

      {/* Cards por itinerario */}
      {cards.map((card, cardIdx) => {
        const excluidas = card.filas.filter((f) => !f.incluida);
        const incluidas = card.filas.filter((f) => f.incluida);
        const noCondutorIncluidas = incluidas.filter((f) => f.responsableOverride !== "conductor");

        return (
          <div
            key={card.group.itinerario_id ?? "__sin__"}
            className="rounded-xl border bg-card p-5 space-y-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-base">
                  {card.group.conductor_email
                    ? card.group.conductor_email.split("@")[0]
                    : "Sin conductor"}{" "}
                  · {card.group.itinerario_nombre ?? "Sin itinerario"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Período a activar</p>
              </div>
              {periodoLabel && (
                <span className="text-sm text-muted-foreground border rounded px-2.5 py-1 whitespace-nowrap">
                  {periodoLabel}
                </span>
              )}
            </div>

            {card.activado ? (
              <div className="flex items-center gap-2 text-teal-600 bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Pago activado — {incluidas.length} finca(s) en estado Pendiente
                </span>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Fincas a incluir — desmarca o reasigna las que NO paga el conductor
                </p>

                {/* Tabla de fincas */}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Finca</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Litros período</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Incluir</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Responsable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {card.filas.map((fila) => (
                        <tr
                          key={fila.finca_id}
                          className={!fila.incluida ? "opacity-50" : undefined}
                        >
                          <td className="px-3 py-2.5">
                            <span className={!fila.incluida ? "line-through text-muted-foreground" : undefined}>
                              {fila.finca_nombre}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-medium tabular-nums">
                            {fila.litros.toLocaleString("es-CO", { maximumFractionDigits: 1 })} L
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 accent-teal-600"
                              checked={fila.incluida}
                              onChange={(e) =>
                                updateFila(cardIdx, fila.finca_id, { incluida: e.target.checked })
                              }
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            {fila.incluida ? (
                              <Select
                                value={fila.responsableOverride}
                                onValueChange={(v) =>
                                  updateFila(cardIdx, fila.finca_id, {
                                    responsableOverride: v as FincaRow["responsableOverride"],
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 text-xs w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="conductor">Conductor</SelectItem>
                                  <SelectItem value="punto_venta">Punto de venta</SelectItem>
                                  <SelectItem value="gerente">Gerente</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {RESPONSABLE_LABELS[fila.responsableOverride]}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Badge de excluidas */}
                {(excluidas.length > 0 || noCondutorIncluidas.length > 0) && (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {excluidas.length + noCondutorIncluidas.length} finca(s) excluidas del conductor — quedarán pendientes para Gerente / Punto de venta
                    </span>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={() => handleActivar(cardIdx)}
                  disabled={isPending || incluidas.length === 0}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Activando...
                    </>
                  ) : (
                    `Activar pago de este itinerario (${incluidas.length} finca${incluidas.length !== 1 ? "s" : ""})`
                  )}
                </Button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
