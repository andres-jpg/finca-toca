"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Result } from "../../rpc/call-rpc";
import type { CrearTarifaInput } from "../schemas/tarifas.schemas";

export interface FilaHistorialTarifa {
  id: string;
  valorLabel: string;
  desdeLabel: string;
  /** Aún no rige: la única que se puede eliminar. */
  programada: boolean;
  /** Rige ahora. */
  vigente: boolean;
  email: string | null;
  observaciones: string | null;
}

export interface ConceptoTarifaVista {
  concepto: string;
  etiqueta: string;
  ayuda?: string;
  unidad: string;
  /** La que rige ahora (`null` si el concepto aún no tiene tarifa). */
  vigente: { valorLabel: string; desdeLabel: string } | null;
  historial: FilaHistorialTarifa[];
}

interface TarifasPanelProps {
  conceptos: ConceptoTarifaVista[];
  crearTarifa: (input: CrearTarifaInput) => Promise<Result<{ id: string }>>;
  eliminarTarifa: (id: string) => Promise<Result<{ id: string }>>;
}

/** `YYYY-MM-DDTHH:mm` en hora local del navegador, el formato de `datetime-local` (para su `min`). */
function ahoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function TarifasPanel({ conceptos, crearTarifa, eliminarTarifa }: TarifasPanelProps) {
  if (conceptos.length === 0) {
    return <p className="text-sm text-gray-500">Tu cliente no tiene conceptos con tarifa configurable.</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Los procesos ya registrados conservan la tarifa con la que se cobraron.
      </p>
      {conceptos.map((c) => (
        <ConceptoCard key={c.concepto} c={c} crearTarifa={crearTarifa} eliminarTarifa={eliminarTarifa} />
      ))}
    </div>
  );
}

function ConceptoCard({ c, crearTarifa, eliminarTarifa }: { c: ConceptoTarifaVista } & Omit<TarifasPanelProps, "conceptos">) {
  const [pendiente, empezar] = useTransition();

  const eliminar = (id: string) =>
    empezar(async () => {
      const r = await eliminarTarifa(id);
      if (r.ok) toast.success("Tarifa programada eliminada");
      else toast.error(r.message);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {c.etiqueta}
          <span className="text-xs font-normal text-gray-400">{c.concepto}</span>
        </CardTitle>
        {c.ayuda && <CardDescription>{c.ayuda}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {c.vigente ? (
            <div>
              <p className="text-2xl font-semibold text-gray-800">
                {c.vigente.valorLabel}
                <span className="ml-1 text-sm font-normal text-gray-500">/ {c.unidad}</span>
              </p>
              <p className="text-xs text-gray-500">Vigente desde {c.vigente.desdeLabel}</p>
            </div>
          ) : (
            <p className="text-sm text-amber-700">Sin tarifa definida: los procesos de este concepto no se podrán registrar.</p>
          )}
          <NuevaTarifaDialog concepto={c} crearTarifa={crearTarifa} />
        </div>

        {c.historial.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-1.5 pr-3 font-medium">Vigente desde</th>
                  <th className="py-1.5 pr-3 font-medium">Valor</th>
                  <th className="py-1.5 pr-3 font-medium">Creada por</th>
                  <th className="py-1.5 pr-3 font-medium">Nota</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {c.historial.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {h.desdeLabel}{" "}
                      {h.vigente && <Badge variant="secondary">Vigente</Badge>}
                      {h.programada && <Badge variant="outline">Programada</Badge>}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{h.valorLabel}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{h.email ?? "Sistema"}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{h.observaciones ?? ""}</td>
                    <td className="py-1.5 text-right">
                      {h.programada && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Eliminar tarifa programada"
                          disabled={pendiente}
                          onClick={() => eliminar(h.id)}
                        >
                          <Trash2 className="text-red-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NuevaTarifaDialog({ concepto, crearTarifa }: { concepto: ConceptoTarifaVista; crearTarifa: TarifasPanelProps["crearTarifa"] }) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState("");
  const [programar, setProgramar] = useState(false);
  const [desde, setDesde] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const reiniciar = () => {
    setValor("");
    setProgramar(false);
    setDesde("");
    setObservaciones("");
    setError(null);
  };

  const guardar = () =>
    empezar(async () => {
      setError(null);
      const numero = valor.trim() === "" ? NaN : Number(valor);
      if (programar && !desde) {
        setError("Indica desde cuándo rige la tarifa.");
        return;
      }
      const r = await crearTarifa({
        concepto: concepto.concepto,
        valor: numero,
        // El navegador interpreta el `datetime-local` en su zona; se manda con offset (ISO) para que no haya ambigüedad.
        vigenteDesde: programar ? new Date(desde).toISOString() : undefined,
        observaciones,
      });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      toast.success(programar ? "Tarifa programada" : "Tarifa guardada");
      setAbierto(false);
      reiniciar();
    });

  return (
    <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) reiniciar(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Nueva tarifa</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarifa de {concepto.etiqueta.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Solo afecta a lo que se registre desde que entre en vigor. Los procesos ya registrados conservan la tarifa con la que se cobraron.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`tarifa-valor-${concepto.concepto}`}>Valor por {concepto.unidad} ($)</Label>
            <Input
              id={`tarifa-valor-${concepto.concepto}`}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="Ej: 1400"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vigente desde</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={!programar} onChange={() => setProgramar(false)} /> Ahora
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={programar} onChange={() => setProgramar(true)} /> Programar para más adelante
              </label>
            </div>
            {programar && (
              <Input type="datetime-local" min={ahoraLocal()} value={desde} onChange={(e) => setDesde(e.target.value)} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`tarifa-obs-${concepto.concepto}`}>Nota (opcional)</Label>
            <Textarea
              id={`tarifa-obs-${concepto.concepto}`}
              rows={2}
              placeholder="Ej: acuerdo con la cooperativa"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(false)}>Cancelar</Button>
          <Button type="button" size="sm" disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando..." : "Guardar tarifa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
