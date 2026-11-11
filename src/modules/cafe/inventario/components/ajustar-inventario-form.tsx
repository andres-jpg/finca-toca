"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { enteroConMiles } from "../../empaque/lib/empaque";
import { ajustarInventario } from "../actions/ajustes.actions";
import {
  ETIQUETA_MOTIVO_AJUSTE,
  MOTIVOS_AJUSTE,
  enteroConSigno,
  stockTrasAjuste,
  textoAntesDespues,
  type DireccionAjuste,
  type ModoAjuste,
  type MotivoAjuste,
} from "../lib/ajuste";
import { ajusteInventarioSchema, type AjusteInventarioFormInput } from "../schemas/ajuste.schema";

const CAMPO = "h-11 text-base sm:h-9 sm:text-sm";

export interface ProductoAjustable {
  articuloId: string;
  nombre: string;
  /** Unidades actuales; puede ser negativo (el ajuste lo corrige). */
  stock: number;
}

interface AjustarInventarioFormProps {
  productos: ProductoAjustable[];
  /** Producto preseleccionado. */
  articuloInicial?: string | null;
  onSuccess: () => void;
}

/**
 * Ajustar inventario (solo owner/admin; B-15): producto, cantidad nueva o diferencia, motivo obligatorio y
 * observación opcional. Muestra «antes → después» y no deja guardar un resultado negativo. Queda en el kardex del
 * producto y en auditoría; la RPC y el RLS lo vuelven a exigir.
 */
export function AjustarInventarioForm({ productos, articuloInicial, onSuccess }: AjustarInventarioFormProps) {
  const router = useRouter();
  const [articuloId, setArticuloId] = useState(articuloInicial ?? "");
  const [modo, setModo] = useState<ModoAjuste>("nueva");
  const [direccion, setDireccion] = useState<DireccionAjuste>("suma");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState<MotivoAjuste | "">("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const producto = productos.find((p) => p.articuloId === articuloId);
  const entrada = { articuloId, modo, cantidad, direccion: modo === "diferencia" ? direccion : null, motivo: motivo || undefined, observacion };
  const parsed = ajusteInventarioSchema.safeParse(entrada);
  // La vista previa no espera al motivo: con solo la cantidad ya se ve el resultado.
  const vista = ajusteInventarioSchema.safeParse({ ...entrada, motivo: motivo || "correccion" });
  const despues = producto && vista.success ? stockTrasAjuste(producto.stock, vista.data.modo, vista.data.cantidad, vista.data.direccion) : null;
  const negativo = despues !== null && despues < 0;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisar los campos.");
      return;
    }
    if (negativo) {
      setError("El ajuste dejaría el stock en negativo. Revisar la cantidad.");
      return;
    }
    setEnviando(true);
    const r = await ajustarInventario(entrada as AjusteInventarioFormInput);
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(`Ajuste registrado. ${producto?.nombre ?? "El producto"}: ${textoAntesDespues(r.data.antes, r.data.despues)}.`);
    router.refresh();
    onSuccess();
  }

  return (
    <form onSubmit={guardar} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label>Producto</Label>
        <Select value={articuloId} onValueChange={setArticuloId} disabled={enviando}>
          <SelectTrigger className={CAMPO} aria-label="Producto">
            <SelectValue placeholder="Seleccionar un producto" />
          </SelectTrigger>
          <SelectContent>
            {productos.map((p) => (
              <SelectItem key={p.articuloId} value={p.articuloId}>
                {p.nombre} · {enteroConSigno(p.stock)} u
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {producto && (
          <p className={cn("text-xs tabular-nums", producto.stock < 0 ? "font-medium text-red-700" : "text-gray-500")}>
            Stock actual: {enteroConSigno(producto.stock)} u
          </p>
        )}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-gray-700">Indicar</legend>
        <div role="radiogroup" aria-label="Indicar" className="grid grid-cols-2 gap-2">
          {(["nueva", "diferencia"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={modo === m}
              disabled={enviando}
              onClick={() => setModo(m)}
              className={cn(
                "h-11 rounded-md border text-sm font-medium transition-colors",
                modo === m ? "border-amber-600 bg-amber-50 text-amber-900" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50",
              )}
            >
              {m === "nueva" ? "Cantidad nueva" : "Diferencia"}
            </button>
          ))}
        </div>
      </fieldset>

      {modo === "diferencia" && (
        <div className="space-y-1.5">
          <Label>La diferencia</Label>
          <Select value={direccion} onValueChange={(v) => setDireccion(v as DireccionAjuste)} disabled={enviando}>
            <SelectTrigger className={CAMPO} aria-label="La diferencia">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="suma">Suma al stock</SelectItem>
              <SelectItem value="resta">Resta del stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ajuste-inv-cantidad">{modo === "nueva" ? "Cantidad nueva (unidades)" : "Diferencia (unidades)"}</Label>
        <Input
          id="ajuste-inv-cantidad"
          inputMode="numeric"
          autoComplete="off"
          className={CAMPO}
          value={cantidad}
          disabled={enviando}
          onChange={(e) => setCantidad(e.target.value)}
        />
        {producto && despues !== null && (
          <p role="status" className={cn("text-sm tabular-nums", negativo ? "font-medium text-red-700" : "text-gray-700")}>
            {negativo ? `Resultado negativo: ${enteroConSigno(despues)} u. El stock no puede quedar bajo cero.` : `Resultado: ${textoAntesDespues(producto.stock, despues)}`}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Motivo</Label>
        <Select value={motivo} onValueChange={(v) => setMotivo(v as MotivoAjuste)} disabled={enviando}>
          <SelectTrigger className={CAMPO} aria-label="Motivo">
            <SelectValue placeholder="Seleccionar el motivo" />
          </SelectTrigger>
          <SelectContent>
            {MOTIVOS_AJUSTE.map((m) => (
              <SelectItem key={m} value={m}>
                {ETIQUETA_MOTIVO_AJUSTE[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ajuste-inv-obs">Observación (opcional)</Label>
        <Textarea id="ajuste-inv-obs" rows={2} maxLength={500} value={observacion} disabled={enviando} onChange={(e) => setObservacion(e.target.value)} />
      </div>

      <p className="text-xs text-gray-500">
        El ajuste queda en el kardex del producto y en auditoría: quién, cuándo, el antes y el después, y el motivo.
        {producto && producto.stock >= 0 && ` Hoy hay ${enteroConMiles(producto.stock)} u.`}
      </p>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <Button type="submit" className="h-11 w-full sm:h-9" disabled={enviando || negativo}>
        {enviando ? "Guardando…" : "Guardar ajuste"}
      </Button>
    </form>
  );
}
