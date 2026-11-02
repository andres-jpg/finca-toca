"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { guardarEdicion, previsualizarEdicion, type ResultadoEdicion } from "../actions/edicion.actions";
import { construirPayload, describirImpacto, formularioInicial, hayCambios, type DatosEdicion, type FormEdicion } from "../edicion/edicion";

const ETIQUETA_PROCESO: Record<string, string> = { trilla: "Trilla", tostion: "Tostión", molienda: "Molienda", empaque: "Empaque" };

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-gray-600">
        {etiqueta}
      </Label>
      {children}
    </div>
  );
}

/** Modal «Editar lote»: motivo obligatorio → «Ver impacto» (la base simula y revierte) → «Confirmar y guardar». */
export function EditarLoteModal({ datos, zona }: { datos: DatosEdicion; zona: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<FormEdicion>(() => formularioInicial(datos, zona));
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<{ firma: string; r: ResultadoEdicion } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => construirPayload(datos, form, zona), [datos, form, zona]);
  const firma = JSON.stringify([payload, motivo.trim()]);
  const cambios = hayCambios(payload);
  const motivoOk = motivo.trim().length >= 3;
  const vistaVigente = vista?.firma === firma ? vista.r : null;

  function cambiar(fn: (f: FormEdicion) => void) {
    setForm((f) => {
      const copia = structuredClone(f);
      fn(copia);
      return copia;
    });
    setError(null);
  }

  function abrir() {
    setForm(formularioInicial(datos, zona));
    setMotivo("");
    setVista(null);
    setError(null);
    setAbierto(true);
  }

  async function verImpacto() {
    setOcupado(true);
    setError(null);
    const r = await previsualizarEdicion({ loteId: datos.loteId, motivo, ...payload });
    setOcupado(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setVista({ firma, r: r.data });
  }

  async function guardar() {
    setOcupado(true);
    const r = await guardarEdicion({ loteId: datos.loteId, motivo, ...payload });
    setOcupado(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(`Lote ${datos.codigo} corregido`);
    setAbierto(false);
    router.refresh();
  }

  const impacto = vistaVigente ? describirImpacto(vistaVigente.antes, vistaVigente.despues) : [];

  return (
    <>
      <Button type="button" variant="outline" onClick={abrir} className="h-11 sm:h-9">
        <Pencil className="mr-2 h-4 w-4" />
        Editar
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !ocupado && setAbierto(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar el lote {datos.codigo}</DialogTitle>
            <DialogDescription>
              Corrige solo lo que esté mal. Cada cambio queda en la historia del lote con tu usuario, la fecha y el motivo; los valores derivados se recalculan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <Campo id="edit-motivo" etiqueta="Motivo de la corrección (obligatorio)">
              <Textarea id="edit-motivo" value={motivo} onChange={(e) => (setMotivo(e.target.value), setError(null))} rows={2} maxLength={500} placeholder="Ej.: el peso de entrada se digitó mal" />
            </Campo>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-gray-800">Lote</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo id="edit-fecha-rec" etiqueta="Fecha de recepción">
                  <Input id="edit-fecha-rec" type="date" value={form.fechaRecepcion} onChange={(e) => cambiar((f) => void (f.fechaRecepcion = e.target.value))} />
                </Campo>
                <Campo id="edit-llegada-f" etiqueta="Día de llegada">
                  <Input id="edit-llegada-f" type="date" value={form.llegadaFecha} onChange={(e) => cambiar((f) => void (f.llegadaFecha = e.target.value))} />
                </Campo>
                <Campo id="edit-llegada-h" etiqueta="Hora de llegada">
                  <Input id="edit-llegada-h" type="time" value={form.llegadaHora} onChange={(e) => cambiar((f) => void (f.llegadaHora = e.target.value))} />
                </Campo>
                {datos.linea === "marca_propia" && (
                  <Campo id="edit-precio" etiqueta="Precio de compra por kg">
                    <Input id="edit-precio" inputMode="decimal" value={form.precioCompraKg} onChange={(e) => cambiar((f) => void (f.precioCompraKg = e.target.value))} />
                  </Campo>
                )}
                <Campo id="edit-factura" etiqueta="Factura del proveedor">
                  <Input id="edit-factura" value={form.facturaProveedor} onChange={(e) => cambiar((f) => void (f.facturaProveedor = e.target.value))} />
                </Campo>
              </div>
              <Campo id="edit-obs" etiqueta="Observaciones">
                <Textarea id="edit-obs" rows={2} value={form.observaciones} onChange={(e) => cambiar((f) => void (f.observaciones = e.target.value))} />
              </Campo>
            </fieldset>

            {datos.procesos.map((p) => {
              const fp = form.procesos[p.id];
              if (!fp) return null;
              return (
                <fieldset key={p.id} className="space-y-3 rounded-md border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-semibold text-gray-800">{ETIQUETA_PROCESO[p.tipo]}</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Campo id={`p-${p.id}-fecha`} etiqueta="Fecha">
                      <Input id={`p-${p.id}-fecha`} type="date" value={fp.fecha} onChange={(e) => cambiar((f) => void (f.procesos[p.id].fecha = e.target.value))} />
                    </Campo>
                    {p.baches.length === 0 ? (
                      <>
                        <Campo id={`p-${p.id}-ent`} etiqueta="Peso de entrada (kg)">
                          <Input id={`p-${p.id}-ent`} inputMode="decimal" value={fp.pesoEntradaKg} onChange={(e) => cambiar((f) => void (f.procesos[p.id].pesoEntradaKg = e.target.value))} />
                        </Campo>
                        <Campo id={`p-${p.id}-sal`} etiqueta="Peso de salida (kg)">
                          <Input id={`p-${p.id}-sal`} inputMode="decimal" value={fp.pesoSalidaKg} onChange={(e) => cambiar((f) => void (f.procesos[p.id].pesoSalidaKg = e.target.value))} />
                        </Campo>
                      </>
                    ) : (
                      <p className="self-end text-xs text-gray-500 sm:col-span-2">Los pesos de la tostión son la suma de sus baches.</p>
                    )}
                  </div>
                  {p.baches.map((b) => {
                    const fb = fp.baches[b.id];
                    if (!fb) return null;
                    const set = (k: keyof typeof fb) => (e: React.ChangeEvent<HTMLInputElement>) => cambiar((f) => void (f.procesos[p.id].baches[b.id][k] = e.target.value));
                    return (
                      <div key={b.id} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Campo id={`b-${b.id}-e`} etiqueta={`Bache ${b.numero} · entrada (kg)`}>
                          <Input id={`b-${b.id}-e`} inputMode="decimal" value={fb.pesoEntradaKg} onChange={set("pesoEntradaKg")} />
                        </Campo>
                        <Campo id={`b-${b.id}-s`} etiqueta="Salida (kg)">
                          <Input id={`b-${b.id}-s`} inputMode="decimal" value={fb.pesoSalidaKg} onChange={set("pesoSalidaKg")} />
                        </Campo>
                        <Campo id={`b-${b.id}-t`} etiqueta="Temperatura (°C)">
                          <Input id={`b-${b.id}-t`} inputMode="decimal" value={fb.temperaturaC} onChange={set("temperaturaC")} />
                        </Campo>
                        <Campo id={`b-${b.id}-m`} etiqueta="Tiempo (min)">
                          <Input id={`b-${b.id}-m`} inputMode="decimal" value={fb.tiempoMin} onChange={set("tiempoMin")} />
                        </Campo>
                      </div>
                    );
                  })}
                </fieldset>
              );
            })}

            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {vistaVigente && (
              <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {impacto.length > 0 ? (
                  <>
                    <p className="font-medium">Se recalcularán:</p>
                    <ul className="ml-5 list-disc">
                      {impacto.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>Los cambios no alteran la merma, el valor ni el costo.</p>
                )}
                <p className="mt-1 text-xs">{vistaVigente.cambios.length} {vistaVigente.cambios.length === 1 ? "dato cambia" : "datos cambian"}. Confirma para guardar.</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={ocupado} className="h-11 sm:h-9">
              Cancelar
            </Button>
            {vistaVigente ? (
              <Button type="button" onClick={guardar} disabled={ocupado} className="h-11 sm:h-9">
                {ocupado ? "Guardando…" : "Confirmar y guardar"}
              </Button>
            ) : (
              <Button type="button" onClick={verImpacto} disabled={ocupado || !motivoOk || !cambios} className="h-11 sm:h-9">
                {ocupado ? "Calculando…" : "Ver impacto"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
