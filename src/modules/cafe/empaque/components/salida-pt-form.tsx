"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { registrarSalidaPT } from "../actions/empaque.actions";
import type { ProductoTerminado } from "../lib/matriz";
import { enteroConMiles } from "../lib/empaque";
import { ETIQUETA_MOTIVO_SALIDA_PT, MOTIVOS_SALIDA_PT, salidaPtSchema, type MotivoSalidaPt } from "../schemas/empaque.schema";

const CAMPO = "h-11 text-base sm:h-9 sm:text-sm";

interface SalidaPtFormProps {
  /** Productos activos que se pueden elegir. */
  productos: ProductoTerminado[];
  /** Producto preseleccionado (al abrir el formulario desde una celda de la matriz). */
  articuloInicial?: string | null;
  /** owner/admin: ofrecen «Ajuste». La acción y la RPC lo vuelven a exigir. */
  puedeAjustar: boolean;
  onSuccess: () => void;
}

const AYUDA: Record<MotivoSalidaPt, string> = {
  muestra: "Unidades que salen como muestra. La observación es opcional.",
  perdida: "Unidades dañadas o perdidas. Explica qué pasó: la observación es obligatoria.",
  ajuste: "Corrige el conteo (p. ej. tras un conteo físico). La observación es obligatoria y queda en el kardex.",
};

/**
 * Salida manual del producto terminado: muestra, pérdida o ajuste. No hay venta ni cortesía aquí (van con su
 * propia pantalla) y NO hay forma de «dar entrada»: el producto terminado solo aumenta al empacar, salvo un
 * ajuste de un administrador. Pensado para tablet: campos de 44 px y teclado numérico.
 */
export function SalidaPtForm({ productos, articuloInicial, puedeAjustar, onSuccess }: SalidaPtFormProps) {
  const motivos = MOTIVOS_SALIDA_PT.filter((m) => m !== "ajuste" || puedeAjustar);
  const [articuloId, setArticuloId] = useState(articuloInicial ?? "");
  const [motivo, setMotivo] = useState<MotivoSalidaPt | "">("");
  const [direccion, setDireccion] = useState<"aumenta" | "disminuye" | "">("");
  const [unidades, setUnidades] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const producto = productos.find((p) => p.articuloId === articuloId);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = salidaPtSchema.safeParse({
      articuloId,
      motivo: motivo || undefined,
      direccion: direccion || null,
      unidades,
      observaciones,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }
    setEnviando(true);
    const r = await registrarSalidaPT(parsed.data);
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(`${ETIQUETA_MOTIVO_SALIDA_PT[parsed.data.motivo]} registrada`);
    onSuccess();
  }

  return (
    <form onSubmit={guardar} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label>Producto</Label>
        <Select value={articuloId} onValueChange={setArticuloId}>
          <SelectTrigger className={CAMPO} aria-label="Producto">
            <SelectValue placeholder="Elige el producto" />
          </SelectTrigger>
          <SelectContent>
            {productos.map((p) => (
              <SelectItem key={p.articuloId} value={p.articuloId}>
                {p.nombre} · {enteroConMiles(p.stock)} u
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {producto && <p className="text-xs text-gray-500">En inventario: {enteroConMiles(producto.stock)} unidades.</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Motivo</Label>
        <Select value={motivo} onValueChange={(v) => setMotivo(v as MotivoSalidaPt)}>
          <SelectTrigger className={CAMPO} aria-label="Motivo">
            <SelectValue placeholder="Muestra, pérdida o ajuste" />
          </SelectTrigger>
          <SelectContent>
            {motivos.map((m) => (
              <SelectItem key={m} value={m}>
                {ETIQUETA_MOTIVO_SALIDA_PT[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {motivo && <p className="text-xs text-gray-500">{AYUDA[motivo]}</p>}
        {!puedeAjustar && <p className="text-xs text-gray-500">Los ajustes los registra un administrador.</p>}
      </div>

      {motivo === "ajuste" && (
        <div className="space-y-1.5">
          <Label>El ajuste…</Label>
          <Select value={direccion} onValueChange={(v) => setDireccion(v as "aumenta" | "disminuye")}>
            <SelectTrigger className={CAMPO} aria-label="Dirección del ajuste">
              <SelectValue placeholder="Aumenta o disminuye el stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aumenta">Aumenta el stock</SelectItem>
              <SelectItem value="disminuye">Disminuye el stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="salida-unidades">Unidades</Label>
        <Input
          id="salida-unidades"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ej: 5"
          className={CAMPO}
          value={unidades}
          onChange={(e) => setUnidades(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="salida-obs">Observación{motivo === "muestra" || motivo === "" ? " (opcional)" : ""}</Label>
        <Textarea
          id="salida-obs"
          rows={3}
          placeholder={motivo === "perdida" ? "Ej: 3 bolsas rotas al mover la estiba" : motivo === "ajuste" ? "Ej: conteo físico del 02/11" : ""}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <Button type="submit" className="h-11 w-full sm:h-9" disabled={enviando}>
        {enviando ? "Guardando…" : "Registrar salida"}
      </Button>
    </form>
  );
}
