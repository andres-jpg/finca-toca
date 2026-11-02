"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { fechaCorta, formatearKg3 } from "@/modules/cafe/lotes/lib/formato";
import { etiquetaServicio } from "@/modules/cafe/lotes/lib/servicios";
import { entregarLotes } from "../actions/remisiones.actions";
import { NOMBRE_RECIBE_MAX, resumirEntrega, soloDigitos, validarQuienRecibe, type ClienteConLotes } from "../lib/entregar";
import { rutaTiquete } from "../lib/estado";

interface Props {
  clientes: ClienteConLotes[];
  /** Cliente preseleccionado (viene de una tarjeta o del aviso «Lote listo»). */
  clienteInicial: string | null;
  /** Lote preseleccionado. */
  loteInicial: string | null;
  /** `YYYY-MM-DD` de hoy en la zona del cliente. */
  fechaHoy: string;
}

const CAMPO = "h-11";

/**
 * «Entregar» (A-14): cliente → sus lotes listos con casilla (uno o varios) → quién recibe (nombre y cédula, obligatorios)
 * → «Entregar e imprimir remisión». El resumen lateral muestra el valor real por lote y por servicio y el total. Una sola
 * remisión por entrega. Los controles miden ≥ 44 px (tablet de la planta). Esconder el botón a Gerencia es cosmético:
 * la página, la action y la RPC repiten módulo y rol.
 */
export function EntregarForm({ clientes, clienteInicial, loteInicial, fechaHoy }: Props) {
  const router = useRouter();
  const [terceroId, setTerceroId] = useState<string>(clienteInicial ?? "");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(loteInicial ? [loteInicial] : []));
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [fecha, setFecha] = useState(fechaHoy);
  const [observaciones, setObservaciones] = useState("");
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cliente = clientes.find((c) => c.terceroId === terceroId) ?? null;
  const seleccion = useMemo(() => (cliente ? cliente.lotes.filter((l) => elegidos.has(l.id)) : []), [cliente, elegidos]);
  const resumen = useMemo(() => resumirEntrega(seleccion), [seleccion]);
  const errores = validarQuienRecibe(nombre, documento);
  const hayErrores = Boolean(errores.nombre || errores.documento);
  const fechaMin = seleccion.reduce((m, l) => (l.fechaRecepcion > m ? l.fechaRecepcion : m), "");

  function cambiarCliente(id: string) {
    setTerceroId(id);
    setElegidos(new Set());
  }

  function alternar(id: string) {
    setElegidos((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  async function entregar() {
    setIntentado(true);
    if (hayErrores || seleccion.length === 0 || !fecha) return;
    setEnviando(true);
    const r = await entregarLotes({
      loteIds: seleccion.map((l) => l.id),
      fecha,
      recibeNombre: nombre,
      recibeDocumento: documento,
      observaciones,
    });
    if (!r.ok) {
      setEnviando(false);
      toast.error(r.message);
      return;
    }
    toast.success(`Remisión ${r.data.numero} generada`);
    router.push(rutaTiquete(r.data.id, 2));
  }

  if (clientes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-base text-gray-600">
        No hay lotes listos para entregar.
      </p>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section className="space-y-2" aria-labelledby="paso-cliente">
          <h2 id="paso-cliente" className="text-base font-semibold text-gray-800">1 · Cliente</h2>
          <select
            id="entrega-cliente"
            aria-label="Cliente"
            value={terceroId}
            onChange={(e) => cambiarCliente(e.target.value)}
            className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-base text-gray-900"
          >
            <option value="">Elige un cliente…</option>
            {clientes.map((c) => (
              <option key={c.terceroId} value={c.terceroId}>
                {c.nombre} ({c.lotes.length} {c.lotes.length === 1 ? "lote listo" : "lotes listos"})
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-2" aria-labelledby="paso-lotes">
          <h2 id="paso-lotes" className="text-base font-semibold text-gray-800">2 · Lotes listos</h2>
          {!cliente ? (
            <p className="text-sm text-gray-500">Elige un cliente para ver sus lotes listos.</p>
          ) : (
            <ul className="space-y-2">
              {cliente.lotes.map((l) => (
                <li key={l.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 has-[:checked]:border-gray-900 has-[:checked]:bg-gray-50">
                    <input type="checkbox" checked={elegidos.has(l.id)} onChange={() => alternar(l.id)} className="h-5 w-5 shrink-0 accent-gray-900" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold tabular-nums text-gray-900">{l.codigo}</span>
                      <span className="block text-sm text-gray-600">
                        Recibido {fechaCorta(l.fechaRecepcion)} · entrega {formatearKg3(l.pesoEntregadoKg)} kg
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {intentado && cliente && seleccion.length === 0 && <p role="alert" className="text-sm text-red-700">Elige al menos un lote.</p>}
        </section>

        <section className="space-y-3" aria-labelledby="paso-recibe">
          <h2 id="paso-recibe" className="text-base font-semibold text-gray-800">3 · Quién recibe</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entrega-nombre">Nombre de quien recibe</Label>
              <Input
                id="entrega-nombre"
                value={nombre}
                maxLength={NOMBRE_RECIBE_MAX}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="off"
                aria-invalid={Boolean(errores.nombre) && (intentado || nombre.length > 0)}
                aria-describedby="entrega-nombre-error"
                className={CAMPO}
              />
              <p id="entrega-nombre-error" role="alert" className="min-h-5 text-sm text-red-700">{intentado || nombre ? (errores.nombre ?? "") : ""}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entrega-documento">Cédula</Label>
              <Input
                id="entrega-documento"
                inputMode="numeric"
                pattern="[0-9]*"
                value={documento}
                maxLength={20}
                onChange={(e) => setDocumento(soloDigitos(e.target.value))}
                autoComplete="off"
                aria-invalid={Boolean(errores.documento) && (intentado || documento.length > 0)}
                aria-describedby="entrega-documento-error"
                className={CAMPO}
              />
              <p id="entrega-documento-error" role="alert" className="min-h-5 text-sm text-red-700">{intentado || documento ? (errores.documento ?? "") : ""}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entrega-fecha">Fecha de entrega</Label>
              <Input id="entrega-fecha" type="date" value={fecha} min={fechaMin || undefined} max={fechaHoy} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entrega-obs">Observaciones (opcional)</Label>
            <Textarea id="entrega-obs" value={observaciones} rows={2} maxLength={500} onChange={(e) => setObservaciones(e.target.value)} placeholder="Se imprime en la remisión" />
          </div>
        </section>
      </div>

      <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start" aria-label="Resumen de la entrega">
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-live="polite">
          <h2 className="text-base font-semibold text-gray-800">Resumen</h2>
          {resumen.lotes.length === 0 ? (
            <p className="text-sm text-gray-500">Elige uno o varios lotes.</p>
          ) : (
            <ul className="space-y-3">
              {resumen.lotes.map((l) => (
                <li key={l.id} className="space-y-1">
                  <p className="flex items-baseline justify-between gap-2 font-semibold text-gray-900">
                    <span className="tabular-nums">{l.codigo}</span>
                    <span className="tabular-nums">{formatearCOP(l.valor)}</span>
                  </p>
                  <ul className="space-y-0.5 text-sm text-gray-600">
                    {l.servicios.map((s) => (
                      <li key={s.tipo} className="flex justify-between gap-2">
                        <span>{etiquetaServicio(s.tipo)}</span>
                        <span className="tabular-nums">{s.tipo === "empaque" && s.valor === 0 ? "incluido" : formatearCOP(s.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-baseline justify-between border-t border-gray-200 pt-3">
            <span className="text-sm text-gray-600">Total ({formatearKg3(resumen.pesoEntregadoKg)} kg)</span>
            <span className="text-xl font-bold tabular-nums text-gray-900">{formatearCOP(resumen.total)}</span>
          </div>
          <p className="text-xs text-gray-500">Valor de referencia de los servicios: la remisión no es una factura.</p>
        </div>
        <Button type="button" onClick={entregar} disabled={enviando || (intentado && (hayErrores || seleccion.length === 0))} className="h-12 w-full text-base">
          <Printer className="mr-2 h-4 w-4" aria-hidden />
          {enviando ? "Entregando…" : "Entregar e imprimir remisión"}
        </Button>
      </aside>
    </div>
  );
}
