"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Result } from "../../rpc/call-rpc";
import type { OrigenParametro } from "../lib/valor";
import type { ParametroTipo } from "../registry";

/** Parámetro listo para pintar (serializable: el schema Zod se queda en el servidor). */
export interface ParametroVista {
  clave: string;
  etiqueta: string;
  ayuda?: string;
  grupo: string;
  tipo: ParametroTipo;
  unidad?: string;
  /** Número, `{ min, max }` o `null` ("sin configurar"). */
  valor: unknown;
  origen: OrigenParametro;
}

interface ParametrosFormProps {
  parametros: ParametroVista[];
  guardarParametro: (clave: string, valor: unknown) => Promise<Result<{ clave: string; valor: unknown }>>;
}

export function ParametrosForm({ parametros, guardarParametro }: ParametrosFormProps) {
  if (parametros.length === 0) {
    return <p className="text-sm text-gray-500">Tu cliente no tiene parámetros configurables.</p>;
  }
  const grupos = new Map<string, ParametroVista[]>();
  for (const p of parametros) grupos.set(p.grupo, [...(grupos.get(p.grupo) ?? []), p]);

  return (
    <div className="space-y-4">
      {[...grupos].map(([grupo, items]) => (
        <Card key={grupo}>
          <CardHeader>
            <CardTitle className="text-base">{grupo}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {items.map((p) => (
              <ParametroFila key={p.clave} p={p} guardarParametro={guardarParametro} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const aTexto = (n: unknown): string => (typeof n === "number" ? String(n) : "");

function ParametroFila({ p, guardarParametro }: { p: ParametroVista } & Pick<ParametrosFormProps, "guardarParametro">) {
  const rango = p.tipo === "rango" && p.valor && typeof p.valor === "object" ? (p.valor as { min?: unknown; max?: unknown }) : null;
  const [numero, setNumero] = useState(p.tipo === "numero" ? aTexto(p.valor) : "");
  const [min, setMin] = useState(aTexto(rango?.min));
  const [max, setMax] = useState(aTexto(rango?.max));
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  // Sin valor efectivo (rango sin configurar): se avisa en vez de dejar un campo vacío sin explicación.
  const sinConfigurar = p.valor === null || p.valor === undefined;

  const guardar = () =>
    empezar(async () => {
      setError(null);
      let valor: unknown;
      if (p.tipo === "numero") {
        valor = numero.trim() === "" ? undefined : Number(numero);
      } else if (min.trim() === "" && max.trim() === "") {
        valor = null; // vacío = volver a "sin configurar"
      } else {
        valor = {
          min: min.trim() === "" ? undefined : Number(min),
          max: max.trim() === "" ? undefined : Number(max),
        };
      }
      const r = await guardarParametro(p.clave, valor);
      if (r.ok) toast.success(`${p.etiqueta} guardado`);
      else setError(r.message);
    });

  return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`param-${p.clave}`} className="text-sm font-medium">{p.etiqueta}</Label>
        {sinConfigurar && <Badge variant="outline" className="text-amber-700">Sin configurar</Badge>}
        {!sinConfigurar && p.origen === "defecto" && <Badge variant="secondary">Valor por defecto</Badge>}
      </div>
      {p.ayuda && <p className="text-xs text-gray-500">{p.ayuda}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {p.tipo === "numero" ? (
          <Input
            id={`param-${p.clave}`}
            className="w-36"
            type="number"
            step="any"
            inputMode="decimal"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
        ) : (
          <>
            <Input id={`param-${p.clave}`} className="w-28" type="number" step="any" inputMode="decimal" placeholder="Mínimo" aria-label={`${p.etiqueta}: mínimo`} value={min} onChange={(e) => setMin(e.target.value)} />
            <span className="text-gray-400">a</span>
            <Input className="w-28" type="number" step="any" inputMode="decimal" placeholder="Máximo" aria-label={`${p.etiqueta}: máximo`} value={max} onChange={(e) => setMax(e.target.value)} />
          </>
        )}
        {p.unidad && <span className="text-sm text-gray-500">{p.unidad}</span>}
        <Button type="button" size="sm" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando..." : "Guardar"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
