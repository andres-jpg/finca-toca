"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatKg } from "@/modules/core/formato/numeros";
import { convertirPresentacion } from "../actions/empaque.actions";
import { avisoCuadre, cuadreConversion, unidadesQueCuadran } from "../lib/conversion";
import { ETIQUETA_FORMA, enteroConMiles } from "../lib/empaque";
import type { ProductoTerminado } from "../lib/matriz";
import { convertirPresentacionSchema } from "../schemas/empaque.schema";

const CAMPO = "h-11 text-base sm:h-9 sm:text-sm";

/** Unidades convertibles de un producto en un lote (ya calculadas en el servidor). */
export interface SaldoConvertibleVista {
  loteId: string;
  codigo: string;
  articuloId: string;
  unidades: number;
}

interface ConvertirPresentacionFormProps {
  /** Productos terminados activos. */
  productos: ProductoTerminado[];
  saldos: SaldoConvertibleVista[];
  /** `YYYY-MM-DD` de hoy en la zona del cliente. */
  fechaHoy: string;
  onSuccess: () => void;
}

const entero = (t: string): number => {
  const n = Number(t.replace(/\./g, "").trim());
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/**
 * «Convertir presentación» (A-15, reemplaza a «Reabrir» en el inventario): saca unidades de una presentación de un
 * lote de marca propia y las entra en otra del mismo tipo de café y forma. Muestra en vivo los kilos de cada lado y
 * avisa si no cuadran (no bloquea). Tablet: campos de 44 px y teclado numérico.
 */
export function ConvertirPresentacionForm({ productos, saldos, fechaHoy, onSuccess }: ConvertirPresentacionFormProps) {
  const [origenId, setOrigenId] = useState("");
  const [loteId, setLoteId] = useState("");
  const [uOrigen, setUOrigen] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [uDestino, setUDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const porId = useMemo(() => new Map(productos.map((p) => [p.articuloId, p])), [productos]);
  const origenes = useMemo(() => productos.filter((p) => saldos.some((s) => s.articuloId === p.articuloId)), [productos, saldos]);
  const origen = porId.get(origenId);
  const lotes = useMemo(() => saldos.filter((s) => s.articuloId === origenId), [saldos, origenId]);
  const saldo = lotes.find((l) => l.loteId === loteId);
  const destinos = useMemo(
    () => (origen ? productos.filter((p) => p.articuloId !== origen.articuloId && p.tipoCafeId === origen.tipoCafeId && (p.forma ?? "grano") === (origen.forma ?? "grano")) : []),
    [productos, origen],
  );
  const destino = porId.get(destinoId);

  const uo = entero(uOrigen);
  const ud = entero(uDestino);
  const cuadre = origen && destino && uo > 0 && ud > 0 ? cuadreConversion({ presentacionG: origen.presentacionG, unidades: uo }, { presentacionG: destino.presentacionG, unidades: ud }) : null;
  const aviso = cuadre ? avisoCuadre(cuadre) : null;
  const sugeridas = origen && destino && uo > 0 ? unidadesQueCuadran({ presentacionG: origen.presentacionG, unidades: uo }, destino.presentacionG) : null;

  function elegirOrigen(id: string) {
    setOrigenId(id);
    setDestinoId("");
    const ls = saldos.filter((s) => s.articuloId === id);
    setLoteId(ls.length === 1 ? ls[0].loteId : "");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = convertirPresentacionSchema.safeParse({ loteId, fecha: fechaHoy, origenId, unidadesOrigen: uOrigen, destinoId, unidadesDestino: uDestino, motivo });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }
    if (saldo && parsed.data.unidadesOrigen > saldo.unidades) {
      setError(`Del lote ${saldo.codigo} solo quedan ${enteroConMiles(saldo.unidades)} unidades para convertir.`);
      return;
    }
    setEnviando(true);
    const r = await convertirPresentacion(parsed.data);
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success("Presentación convertida");
    if (!r.data.cuadra) toast.warning(`Los kilos no cuadran: diferencia de ${formatKg(r.data.diferencia_kg)}.`);
    for (const a of r.data.advertencias) toast.warning(`${a.articulo ?? "Un insumo"} quedó en ${enteroConMiles(a.stock_resultante)}.`);
    onSuccess();
  }

  return (
    <form onSubmit={guardar} noValidate className="space-y-4">
      <p className="text-sm text-gray-600">Reempaca producto ya empacado de un lote de marca propia en otra presentación, sin moler. Descuenta las bolsas y etiquetas del destino y deja la traza en el lote.</p>

      <fieldset className="space-y-3 rounded-lg border border-stone-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Sale (origen)</legend>
        <div className="space-y-1.5">
          <Label>Producto</Label>
          <Select value={origenId} onValueChange={elegirOrigen}>
            <SelectTrigger className={CAMPO}>
              <SelectValue placeholder={origenes.length === 0 ? "No hay producto empacado para convertir" : "Elige el producto"} />
            </SelectTrigger>
            <SelectContent>
              {origenes.map((p) => (
                <SelectItem key={p.articuloId} value={p.articuloId}>
                  {p.nombre} · {ETIQUETA_FORMA[p.forma ?? "grano"]} · {enteroConMiles(p.stock)} u
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Lote de origen</Label>
            <Select value={loteId} onValueChange={setLoteId} disabled={!origenId}>
              <SelectTrigger className={CAMPO}>
                <SelectValue placeholder="Elige el lote" />
              </SelectTrigger>
              <SelectContent>
                {lotes.map((l) => (
                  <SelectItem key={l.loteId} value={l.loteId}>
                    {l.codigo} · {enteroConMiles(l.unidades)} u
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-uo">Unidades</Label>
            <Input id="conv-uo" inputMode="numeric" className={CAMPO} value={uOrigen} onChange={(e) => setUOrigen(e.target.value)} placeholder="2" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-stone-200 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Entra (destino)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Producto</Label>
            <Select value={destinoId} onValueChange={setDestinoId} disabled={!origenId}>
              <SelectTrigger className={CAMPO}>
                <SelectValue placeholder="Misma calidad y forma" />
              </SelectTrigger>
              <SelectContent>
                {destinos.map((p) => (
                  <SelectItem key={p.articuloId} value={p.articuloId}>
                    {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conv-ud">Unidades</Label>
            <div className="flex gap-2">
              <Input id="conv-ud" inputMode="numeric" className={CAMPO} value={uDestino} onChange={(e) => setUDestino(e.target.value)} placeholder="10" />
              {sugeridas !== null && String(sugeridas) !== uDestino && (
                <Button type="button" variant="outline" className="h-11 shrink-0 sm:h-9" onClick={() => setUDestino(String(sugeridas))}>
                  Usar {enteroConMiles(sugeridas)}
                </Button>
              )}
            </div>
          </div>
        </div>
      </fieldset>

      {cuadre && (
        <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm tabular-nums text-gray-700" aria-live="polite">
          {formatKg(cuadre.kgOrigen)} sale → {formatKg(cuadre.kgDestino)} entra
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {aviso} Puedes registrarlo igual.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="conv-motivo">Motivo (opcional)</Label>
        <Textarea id="conv-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" className="h-11 w-full" disabled={enviando}>
        {enviando ? "Convirtiendo…" : "Convertir presentación"}
      </Button>
    </form>
  );
}
