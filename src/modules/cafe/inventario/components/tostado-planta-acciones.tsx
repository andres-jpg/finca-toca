"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EntityModal } from "@/components/shared/entity-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatKg } from "@/modules/core/formato/numeros";
import { empacarDesdePlanta, molerTostado } from "../../empaque/actions/empaque.actions";
import {
  enteroConMiles,
  ETIQUETA_MODO_ETIQUETA,
  etiquetasDeLinea,
  parsearUnidades,
  textoEtiquetas,
  type FormaCafe,
  type ModoEtiqueta,
} from "../../empaque/lib/empaque";
import { parsearDecimal } from "../../procesos/lib/numero";
import { etiquetaPresentacion } from "../../tipos/lib/productos";

interface Props {
  loteId: string;
  codigo: string;
  /** Kilos de grano y de molido que hay tostados en planta de este lote. */
  granoKg: number;
  molidoKg: number;
  /** Forma de la fila donde se muestran los botones: solo el grano se puede moler. */
  forma: FormaCafe;
  /** Presentaciones (g) con bolsa activa. */
  presentaciones: number[];
  /** `YYYY-MM-DD` de hoy en la zona del cliente. */
  fechaHoy: string;
}

type Dialogo = "moler" | "empacar" | null;
const clave = (g: number, forma: FormaCafe) => `${g}:${forma}`;
const BOTON = "inline-flex min-h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-800 hover:bg-gray-50";

/**
 * Acciones de una fila de «Tostado sin empacar» (marca propia): «Moler» pasa kilos de grano a molido y «Empacar» saca bolsas
 * del café que hay en planta, poco a poco y sin báscula. Esconder los botones a Gerencia es cosmético: las acciones y las RPC
 * repiten módulo y rol.
 */
export function TostadoPlantaAcciones({ loteId, codigo, forma, granoKg, molidoKg, presentaciones, fechaHoy }: Props) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const cerrar = () => setDialogo(null);
  return (
    <>
      <span className="flex gap-1.5">
        {forma === "grano" && granoKg > 0 && (
          <button type="button" className={BOTON} onClick={() => setDialogo("moler")} aria-label={`Moler café de ${codigo}`}>
            Moler
          </button>
        )}
        <button type="button" className={BOTON} onClick={() => setDialogo("empacar")} aria-label={`Empacar café de ${codigo}`}>
          Empacar
        </button>
      </span>
      <EntityModal open={dialogo === "moler"} onClose={cerrar} title={`Moler · ${codigo}`}>
        {dialogo === "moler" && <MolerForm loteId={loteId} granoKg={granoKg} onSuccess={cerrar} />}
      </EntityModal>
      <EntityModal open={dialogo === "empacar"} onClose={cerrar} title={`Empacar · ${codigo}`}>
        {dialogo === "empacar" && (
          <EmpacarForm loteId={loteId} granoKg={granoKg} molidoKg={molidoKg} presentaciones={presentaciones} fechaHoy={fechaHoy} onSuccess={cerrar} />
        )}
      </EntityModal>
    </>
  );
}

function MolerForm({ loteId, granoKg, onSuccess }: { loteId: string; granoKg: number; onSuccess: () => void }) {
  const router = useRouter();
  const [kgTxt, setKgTxt] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kg = parsearDecimal(kgTxt);
  const supera = kg !== null && kg > granoKg + 0.0005;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (kg === null || kg <= 0) return setError("Indica los kilos a moler.");
    if (supera) return setError(`Solo hay ${formatKg(granoKg)} en grano en planta.`);
    setEnviando(true);
    const r = await molerTostado({ loteId, kg });
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(`Molido: ${formatKg(r.data.molido_kg)}`, { description: `Quedan ${formatKg(r.data.grano_restante_kg)} en grano en planta.` });
    router.refresh();
    onSuccess();
  }

  return (
    <form onSubmit={guardar} className="space-y-4" noValidate>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
        En planta, en grano: <span className="font-semibold tabular-nums">{formatKg(granoKg)}</span>. Lo que no se muele se queda en planta.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="moler-kg">Kilos a moler</Label>
        <div className="flex gap-2">
          <Input id="moler-kg" value={kgTxt} onChange={(e) => setKgTxt(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="Ej: 10,5" autoFocus className="h-11 text-base" aria-invalid={supera} />
          <Button type="button" variant="outline" className="h-11" onClick={() => setKgTxt(String(granoKg).replace(".", ","))}>
            Todo
          </Button>
        </div>
      </div>
      {(error || supera) && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? `Solo hay ${formatKg(granoKg)} en grano en planta.`}
        </p>
      )}
      <Button type="submit" className="h-11 w-full" disabled={enviando || supera}>
        {enviando ? "Guardando…" : "Moler"}
      </Button>
    </form>
  );
}

function EmpacarForm({ loteId, granoKg, molidoKg, presentaciones, fechaHoy, onSuccess }: Omit<Props, "codigo" | "forma"> & { onSuccess: () => void }) {
  const router = useRouter();
  const [fecha, setFecha] = useState(fechaHoy);
  const [unidadesTxt, setUnidadesTxt] = useState<Record<string, string>>({});
  const [modo, setModo] = useState<Record<string, ModoEtiqueta>>({});
  const [etiquetasTxt, setEtiquetasTxt] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formas: { forma: FormaCafe; disponible: number }[] = [
    { forma: "grano", disponible: granoKg },
    { forma: "molido", disponible: molidoKg },
  ];
  const lineas = presentaciones.flatMap((g) =>
    formas.flatMap(({ forma }) => {
      const unidades = parsearUnidades(unidadesTxt[clave(g, forma)]);
      if (unidades === null) return [];
      const k = clave(g, forma);
      const etiquetas = etiquetasDeLinea(modo[k] ?? "si", unidades, etiquetasTxt[k] ?? "");
      return [{ g, forma, unidades, etiquetas, k }];
    }),
  );
  const kgDe = (forma: FormaCafe) => lineas.filter((l) => l.forma === forma).reduce((a, l) => a + (l.g * l.unidades) / 1000, 0);
  const supera = formas.some(({ forma, disponible }) => kgDe(forma) > disponible + 0.0005);
  const etiquetasInvalidas = lineas.some((l) => l.etiquetas === null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (lineas.length === 0) return setError("Indica las bolsas de al menos una presentación.");
    if (supera) return setError("Las bolsas suman más café del que hay en planta.");
    if (etiquetasInvalidas) return setError("Revisa cuántas bolsas llevan etiqueta.");
    setEnviando(true);
    const r = await empacarDesdePlanta({
      loteId,
      fecha,
      lineas: lineas.map((l) => ({ presentacionG: l.g, unidades: l.unidades, forma: l.forma, etiquetas: l.etiquetas })),
    });
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(`Empacado: ${formatKg(r.data.en_bolsas_kg)}`, {
      description: `En planta quedan ${formatKg(r.data.grano_restante_kg)} en grano y ${formatKg(r.data.molido_restante_kg)} molido.`,
    });
    for (const a of r.data.advertencias) toast.warning(`${a.articulo ?? "Un insumo"} quedó en ${enteroConMiles(a.stock_resultante)}: registra la compra que falta.`);
    router.refresh();
    onSuccess();
  }

  return (
    <form onSubmit={guardar} className="space-y-5" noValidate>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
        En planta: <span className="font-semibold tabular-nums">{formatKg(granoKg)}</span> en grano ·{" "}
        <span className="font-semibold tabular-nums">{formatKg(molidoKg)}</span> molido. Lo que no empaques se queda en planta.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="ep-fecha">Fecha del empaque</Label>
        <Input id="ep-fecha" type="date" value={fecha} max={fechaHoy} onChange={(e) => setFecha(e.target.value)} className="h-11 text-base" />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-gray-800">Bolsas empacadas</legend>
        {presentaciones.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No hay bolsas activas en Insumos.</p>
        ) : (
          <ul className="space-y-2">
            {presentaciones.map((g) => (
              <li key={g} className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{etiquetaPresentacion(g)}</span>
                {formas.map(({ forma, disponible }) => (
                  <Input
                    key={forma}
                    value={unidadesTxt[clave(g, forma)] ?? ""}
                    onChange={(e) => setUnidadesTxt((u) => ({ ...u, [clave(g, forma)]: e.target.value }))}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={forma === "grano" ? "Grano" : "Molido"}
                    disabled={disponible <= 0 || enviando}
                    aria-label={`${etiquetaPresentacion(g)} ${forma}, bolsas`}
                    className="h-11 text-base"
                  />
                ))}
              </li>
            ))}
          </ul>
        )}
        <p className={cn("text-xs", supera ? "text-red-600" : "text-gray-500")}>
          Empacas {formatKg(kgDe("grano"))} en grano y {formatKg(kgDe("molido"))} molido.
        </p>
      </fieldset>

      {lineas.length > 0 && (
        <fieldset className="space-y-2 rounded-md border border-gray-200 p-3">
          <legend className="px-1 text-sm font-semibold text-gray-800">¿Se empaca con etiqueta?</legend>
          <ul className="space-y-3">
            {lineas.map((l) => {
              const m = modo[l.k] ?? "si";
              return (
                <li key={l.k} className="space-y-1.5">
                  <p className="text-sm text-gray-800">
                    {etiquetaPresentacion(l.g)} {l.forma} · <span className="tabular-nums">{enteroConMiles(l.unidades)}</span> {l.unidades === 1 ? "bolsa" : "bolsas"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div role="radiogroup" aria-label={`Etiqueta de ${etiquetaPresentacion(l.g)} ${l.forma}`} className="inline-flex overflow-hidden rounded-md border border-gray-300">
                      {(["si", "no", "algunas"] as const).map((opcion) => (
                        <button
                          key={opcion}
                          type="button"
                          role="radio"
                          aria-checked={m === opcion}
                          onClick={() => setModo((x) => ({ ...x, [l.k]: opcion }))}
                          className={cn("min-h-11 px-4 text-sm font-medium", m === opcion ? "bg-gray-900 text-white" : "bg-white text-gray-700")}
                        >
                          {ETIQUETA_MODO_ETIQUETA[opcion]}
                        </button>
                      ))}
                    </div>
                    {m === "algunas" && (
                      <>
                        <Input
                          value={etiquetasTxt[l.k] ?? ""}
                          onChange={(e) => setEtiquetasTxt((t) => ({ ...t, [l.k]: e.target.value }))}
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="0"
                          aria-label={`Bolsas con etiqueta de ${etiquetaPresentacion(l.g)} ${l.forma}`}
                          aria-invalid={l.etiquetas === null}
                          className="h-11 w-24 text-base"
                        />
                        <span className="text-xs text-gray-500">
                          {l.etiquetas === null ? <span className="text-red-600">Máximo {enteroConMiles(l.unidades)}</span> : textoEtiquetas(l.unidades, l.etiquetas)}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {(error || supera) && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? "Las bolsas suman más café del que hay en planta."}
        </p>
      )}
      <Button type="submit" className="h-11 w-full" disabled={enviando || supera || etiquetasInvalidas || lineas.length === 0}>
        {enviando ? "Guardando…" : "Empacar"}
      </Button>
    </form>
  );
}
