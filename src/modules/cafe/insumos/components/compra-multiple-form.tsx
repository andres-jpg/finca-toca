"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCOP } from "@/modules/core/formato/numeros";
import { TerceroCombobox } from "@/modules/core/terceros/components/tercero-combobox";
import { registrarComprasInsumos } from "../actions/insumos.actions";
import { etiquetaPresentacion } from "../../tipos/lib/productos";
import { ETIQUETA_CLASE } from "../lib/insumos";
import { compraMultipleSchema, costoUnitarioDeLinea } from "../schemas/insumo.schema";
import type { InsumoEmpaque } from "../types";

const CAMPO = "h-11 text-base sm:h-9 sm:text-sm";

interface Linea {
  clave: number;
  articuloId: string;
  cantidad: string;
  modoPrecio: "unitario" | "total";
  precio: string;
}

const lineaVacia = (clave: number): Linea => ({ clave, articuloId: "", cantidad: "", modoPrecio: "unitario", precio: "" });
/** Texto → número (acepta coma decimal); vacío → `NaN` para que el esquema lo marque. */
const aNumero = (t: string) => (t.trim() === "" ? Number.NaN : Number(t.replace(",", ".")));

/**
 * Compra de varios insumos a la vez: una fila por insumo (desplegable, cantidad y precio unitario o total) y UNA sola fecha,
 * proveedor y observación (p. ej. el número de factura) para toda la compra. Proveedor y observación son opcionales.
 */
export function CompraMultipleForm({ insumos, fechaHoy, onSuccess }: { insumos: InsumoEmpaque[]; fechaHoy: string; onSuccess: () => void }) {
  const activos = insumos.filter((i) => i.activo);
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia(1), lineaVacia(2)]);
  const [siguiente, setSiguiente] = useState(3);
  const [fecha, setFecha] = useState(fechaHoy);
  const [terceroId, setTerceroId] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (clave: number, parte: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...parte } : l)));
  const quitar = (clave: number) => setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.clave !== clave) : ls));
  const agregar = () => {
    setLineas((ls) => [...ls, lineaVacia(siguiente)]);
    setSiguiente((n) => n + 1);
  };

  const entrada = {
    fecha,
    terceroId,
    observaciones,
    lineas: lineas.map((l) => ({ articuloId: l.articuloId, cantidad: aNumero(l.cantidad), modoPrecio: l.modoPrecio, precio: aNumero(l.precio) })),
  };
  const valido = compraMultipleSchema.safeParse(entrada);
  /** Total de la compra con lo que ya está completo (se muestra aunque falten filas). */
  const total = entrada.lineas.reduce((a, l) => {
    if (!Number.isFinite(l.cantidad) || !Number.isFinite(l.precio) || l.cantidad <= 0) return a;
    return a + (l.modoPrecio === "total" ? l.precio : l.precio * l.cantidad);
  }, 0);

  async function guardar() {
    setError(null);
    if (!valido.success) {
      setError(valido.error.issues[0]?.message ?? "Revisa los datos de la compra");
      return;
    }
    setEnviando(true);
    const r = await registrarComprasInsumos(entrada);
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(`Compra registrada: ${valido.data.lineas.length} ${valido.data.lineas.length === 1 ? "insumo" : "insumos"}`);
    onSuccess();
  }

  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {lineas.map((l, i) => {
          const n = aNumero(l.cantidad);
          const p = aNumero(l.precio);
          const unitario = Number.isFinite(n) && Number.isFinite(p) && n > 0 ? costoUnitarioDeLinea({ cantidad: n, modoPrecio: l.modoPrecio, precio: p }) : null;
          return (
            <li key={l.clave} className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <select
                  aria-label={`Insumo ${i + 1}`}
                  value={l.articuloId}
                  onChange={(e) => cambiar(l.clave, { articuloId: e.target.value })}
                  className="h-11 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 text-base text-gray-900 sm:h-9 sm:text-sm"
                >
                  <option value="">Elige un insumo…</option>
                  {activos.map((a) => (
                    <option key={a.articulo_id} value={a.articulo_id}>
                      {ETIQUETA_CLASE[a.clase]} {etiquetaPresentacion(a.presentacionG)}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="ghost" size="icon" onClick={() => quitar(l.clave)} disabled={lineas.length === 1} aria-label={`Quitar insumo ${i + 1}`} className="h-11 w-11 sm:h-9 sm:w-9">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-1">
                  <Label htmlFor={`cm-cant-${l.clave}`} className="text-xs">Cantidad</Label>
                  <Input id={`cm-cant-${l.clave}`} inputMode="numeric" value={l.cantidad} onChange={(e) => cambiar(l.clave, { cantidad: e.target.value })} placeholder="Ej: 500" className={CAMPO} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">El precio es</Label>
                  <div role="radiogroup" aria-label={`Tipo de precio del insumo ${i + 1}`} className="flex h-11 overflow-hidden rounded-md border border-gray-300 sm:h-9">
                    {(["unitario", "total"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={l.modoPrecio === m}
                        onClick={() => cambiar(l.clave, { modoPrecio: m })}
                        className={`flex-1 text-sm font-medium ${l.modoPrecio === m ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                      >
                        {m === "unitario" ? "Unitario" : "Total"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`cm-precio-${l.clave}`} className="text-xs">{l.modoPrecio === "unitario" ? "Precio unitario (COP)" : "Precio total (COP)"}</Label>
                  <Input id={`cm-precio-${l.clave}`} inputMode="decimal" value={l.precio} onChange={(e) => cambiar(l.clave, { precio: e.target.value })} placeholder="Ej: 700" className={CAMPO} />
                </div>
              </div>
              {unitario !== null && (
                <p className="text-xs text-gray-500">
                  {l.modoPrecio === "total" ? `Queda a ${formatCOP(unitario)} por unidad` : `Esta línea suma ${formatCOP(Math.round(p * n))}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="outline" onClick={agregar} className="h-11 w-full sm:h-9">
        <Plus className="mr-2 h-4 w-4" />
        Agregar otro insumo
      </Button>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="space-y-1.5">
          <Label htmlFor="cm-fecha">Fecha de la compra</Label>
          <Input id="cm-fecha" type="date" value={fecha} max={fechaHoy} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
        </div>
        <div className="space-y-1.5">
          <Label>Proveedor (opcional)</Label>
          <TerceroCombobox value={terceroId} onChange={(id) => setTerceroId(id)} rol="proveedor" permitirCrear placeholder="Selecciona un proveedor" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cm-obs">Observaciones (opcional)</Label>
          <Textarea id="cm-obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej: factura 1234" />
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-sm text-gray-600">Total de la compra</span>
        <span className="text-xl font-bold tabular-nums text-gray-900">{formatCOP(Math.round(total))}</span>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button type="button" onClick={guardar} disabled={enviando} className="h-11 w-full sm:h-9">
        {enviando ? "Guardando…" : "Registrar compra"}
      </Button>
    </div>
  );
}
