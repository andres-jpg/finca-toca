"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatCOP } from "@/modules/core/formato/numeros";
import { cargarInventarioInicial } from "../actions/ajustes.actions";
import { CLASES_CARGA, ETIQUETA_CLASE_CARGA, textoCantidadCarga, unidadCostoCarga, type ClaseCarga } from "../lib/ajuste";
import type { CargaInicial } from "../queries/ajustes.queries";
import { cargaInicialSchema } from "../schemas/ajuste.schema";

const CAMPO = "h-11 text-base sm:h-9 sm:text-sm";

interface CargaInicialPanelProps {
  /** Productos terminados activos. */
  productos: { articuloId: string; nombre: string }[];
  /** Tipos de café activos. */
  tipos: { id: string; nombre: string }[];
  cargas: CargaInicial[];
  /** `es-CO` en la zona del cliente: se formatea en el servidor, el navegador no calcula fechas. */
  fechasFormateadas: Record<string, string>;
}

/**
 * Carga inicial (solo owner/admin; B-15): lo que Cofradía ya tiene antes de usar la herramienta, con su costo
 * unitario estimado. Una vez por producto (o por tipo de café en tostado y café verde); no genera compra ni factura.
 * Las correcciones posteriores van por «Ajustar inventario».
 */
export function CargaInicialPanel({ productos, tipos, cargas, fechasFormateadas }: CargaInicialPanelProps) {
  const router = useRouter();
  const [clase, setClase] = useState<ClaseCarga>("producto");
  const [objetoId, setObjetoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const nombres = useMemo(() => new Map([...productos.map((p) => [p.articuloId, p.nombre] as const), ...tipos.map((t) => [t.id, t.nombre] as const)]), [productos, tipos]);
  // Lo que ya tiene carga no se vuelve a ofrecer: la base lo rechaza igual.
  const cargados = useMemo(() => new Set(cargas.filter((c) => c.clase === clase).map((c) => c.articuloId ?? c.tipoCafeId)), [cargas, clase]);
  const opciones = (clase === "producto" ? productos.map((p) => ({ id: p.articuloId, nombre: p.nombre })) : tipos).filter((o) => !cargados.has(o.id));
  const unidad = clase === "producto" ? "unidades" : "kg";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const entrada = {
      clase,
      articuloId: clase === "producto" ? objetoId || null : null,
      tipoCafeId: clase === "producto" ? null : objetoId || null,
      cantidad,
      costoUnitario: costo,
      observacion,
    };
    const parsed = cargaInicialSchema.safeParse(entrada);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisar los campos.");
      return;
    }
    setEnviando(true);
    const r = await cargarInventarioInicial(entrada);
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(`Carga inicial registrada: ${nombres.get(objetoId) ?? "producto"}, ${textoCantidadCarga(clase, parsed.data.cantidad)}.`);
    setObjetoId("");
    setCantidad("");
    setCosto("");
    setObservacion("");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-800">Carga inicial</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Inventario que ya existe antes de usar la herramienta. Se carga una vez por producto, con su costo unitario estimado, y no genera compra ni factura.
          Las correcciones posteriores se hacen con «Ajustar inventario».
        </p>
      </div>

      <form onSubmit={guardar} noValidate className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-gray-700">Inventario a cargar</legend>
          <div role="radiogroup" aria-label="Inventario a cargar" className="grid gap-2 sm:grid-cols-3">
            {CLASES_CARGA.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={clase === c}
                disabled={enviando}
                onClick={() => {
                  setClase(c);
                  setObjetoId("");
                  setCantidad("");
                }}
                className={cn(
                  "h-11 rounded-md border text-sm font-medium transition-colors",
                  clase === c ? "border-amber-600 bg-amber-50 text-amber-900" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50",
                )}
              >
                {ETIQUETA_CLASE_CARGA[c]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{clase === "producto" ? "Producto" : "Tipo de café"}</Label>
            <Select value={objetoId} onValueChange={setObjetoId} disabled={enviando || opciones.length === 0}>
              <SelectTrigger className={CAMPO} aria-label={clase === "producto" ? "Producto" : "Tipo de café"}>
                <SelectValue placeholder={opciones.length === 0 ? "Todo cargado" : clase === "producto" ? "Seleccionar un producto" : "Seleccionar un tipo de café"} />
              </SelectTrigger>
              <SelectContent>
                {opciones.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carga-cantidad">Cantidad ({unidad})</Label>
            <Input id="carga-cantidad" inputMode={clase === "producto" ? "numeric" : "decimal"} autoComplete="off" className={CAMPO} value={cantidad} disabled={enviando} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carga-costo">Costo unitario estimado ($ por {unidadCostoCarga(clase)})</Label>
            <Input id="carga-costo" inputMode="decimal" autoComplete="off" className={CAMPO} value={costo} disabled={enviando} onChange={(e) => setCosto(e.target.value)} />
            <p className="text-xs text-gray-500">Estimado: sirve para valorar el inventario.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carga-obs">Observación (opcional)</Label>
            <Textarea id="carga-obs" rows={2} maxLength={500} value={observacion} disabled={enviando} onChange={(e) => setObservacion(e.target.value)} />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full sm:h-9 sm:w-auto" disabled={enviando || objetoId === ""}>
          {enviando ? "Guardando…" : "Registrar carga inicial"}
        </Button>
      </form>

      <section aria-labelledby="cargas-titulo" className="space-y-2">
        <h2 id="cargas-titulo" className="text-base font-semibold text-gray-800">
          Cargas registradas
        </h2>
        {cargas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">Aún no hay cargas iniciales.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Inventario</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Producto</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Cantidad</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Costo unitario</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Registrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {cargas.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">{ETIQUETA_CLASE_CARGA[c.clase]}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{nombres.get(c.articuloId ?? c.tipoCafeId ?? "") ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{textoCantidadCarga(c.clase, c.cantidad)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.costoUnitario === null ? "—" : `${formatCOP(c.costoUnitario)}/${unidadCostoCarga(c.clase)}`}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {fechasFormateadas[c.id]}
                      {c.creadoPor && <span className="block text-xs text-gray-500">{c.creadoPor}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
