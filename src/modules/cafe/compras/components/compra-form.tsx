"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TerceroCombobox } from "@/modules/core/terceros/components/tercero-combobox";
import { repartirPeso } from "../../lotes/lib/repartir-peso";
import { obtenerPrecioSugerido, registrarCompra } from "../actions/compras.actions";
import {
  aTextoDecimal,
  calcularValorCompra,
  diferenciaPesos,
  formatearCOP,
  formatearKg,
  parsearDecimal,
  parsearPrecio,
  pesoDesdeBultos,
  sumaPesos,
} from "../lib/compra";
import { compraSchema, MAX_BULTOS, type CompraFormInput } from "../schemas/compra.schema";

/** Campos de planta: 44 px de alto y letra legible en tablet (en pantallas grandes vuelven al tamaño normal). */
const CAMPO = "h-11 text-base sm:h-10";
const ERROR = "text-xs text-red-600";

export interface TipoCafeOpcion {
  id: string;
  nombre: string;
}

interface CompraFormProps {
  /** Tipos de café activos del cliente. */
  tipos: TipoCafeOpcion[];
  /** Parámetro `cafe.peso_bulto_kg` (62,5 por defecto): ayuda para convertir bultos a kilos. */
  pesoBultoKg: number;
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor: el navegador puede estar en otra). */
  fechaHoy: string;
}

type ModoPeso = "bulto" | "total";
/** Campos a los que se puede atar un error que viene de la RPC. */
type Campo = "tipoCafeId" | "terceroId" | "pesosBultos";

/** Dónde se muestra el error de negocio que devuelve la RPC (el resto va solo al toast). */
const CAMPO_DE_ERROR: Record<string, Campo> = {
  tipo_cafe_invalido: "tipoCafeId",
  tercero_no_es_proveedor: "terceroId",
  tercero_no_encontrado: "terceroId",
  bultos_no_cuadran: "pesosBultos",
};

/**
 * Compra de café para marca propia (HU-F1-01). El operario digita proveedor, tipo, bultos, peso y precio por
 * kilo; el valor total (peso × precio) se calcula en vivo y nunca se digita. Los pesos por bulto salen
 * repartidos en partes iguales y se pueden corregir uno a uno. El precio se propone con el de la última compra
 * al mismo proveedor y tipo, y siempre es editable (cada lote guarda el suyo).
 *
 * El estado es local (no hay campos que dependan de un resolver) y la validación es la del schema Zod, que
 * calcula los errores en cada render; solo se muestran tras el primer intento de guardar.
 */
export function CompraForm({ tipos, pesoBultoKg, fechaHoy }: CompraFormProps) {
  const router = useRouter();

  const [tipoCafeId, setTipoCafeId] = useState(tipos.length === 1 ? tipos[0].id : "");
  const [terceroId, setTerceroId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(fechaHoy);
  const [numBultosTxt, setNumBultosTxt] = useState("1");
  const [modo, setModo] = useState<ModoPeso>("bulto");
  const [pesoBultoTxt, setPesoBultoTxt] = useState(aTextoDecimal(pesoBultoKg));
  const [pesoTotalTxt, setPesoTotalTxt] = useState("");
  const [precioTxt, setPrecioTxt] = useState("");
  const [factura, setFactura] = useState("");
  const [observaciones, setObservaciones] = useState("");
  /** `null` = los pesos por bulto siguen el reparto en partes iguales; con valor, el operario los corrigió. */
  const [pesosTxt, setPesosTxt] = useState<string[] | null>(null);

  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<{ campo: Campo; mensaje: string } | null>(null);

  // --- Precio sugerido ---------------------------------------------------------------------------------
  // Última compra al mismo proveedor y tipo. Guarda para qué par se pidió (`clave`): mientras no coincida con
  // el actual, no hay sugerencia vigente.
  const [sugerencia, setSugerencia] = useState<{ clave: string; precio: number | null } | null>(null);
  const precioTocado = useRef(false);
  const claveSugerencia = terceroId && tipoCafeId ? `${terceroId}|${tipoCafeId}` : null;
  const sugerido = claveSugerencia && sugerencia?.clave === claveSugerencia ? sugerencia.precio : null;

  useEffect(() => {
    if (!terceroId || !tipoCafeId) return;
    let vigente = true;
    const clave = `${terceroId}|${tipoCafeId}`;
    obtenerPrecioSugerido(terceroId, tipoCafeId).then((r) => {
      if (!vigente) return;
      const precio = r.ok ? r.data : null;
      setSugerencia({ clave, precio });
      // Mientras el operario no haya tocado el precio, la sugerencia lo rellena (o lo vacía si ya no hay).
      if (!precioTocado.current) setPrecioTxt(precio === null ? "" : aTextoDecimal(precio));
    });
    return () => {
      vigente = false;
    };
  }, [terceroId, tipoCafeId]);

  // --- Valores derivados -------------------------------------------------------------------------------
  const numBultos = parsearDecimal(numBultosTxt) ?? Number.NaN;
  const pesoKg = modo === "bulto" ? pesoDesdeBultos(numBultos, parsearDecimal(pesoBultoTxt) ?? 0) : (parsearDecimal(pesoTotalTxt) ?? Number.NaN);
  const precioKg = parsearPrecio(precioTxt) ?? Number.NaN;
  const valorTotal = calcularValorCompra(pesoKg, precioKg);

  const bultosValidos = Number.isInteger(numBultos) && numBultos >= 1 && numBultos <= MAX_BULTOS;
  // Reparto en partes iguales (el compilador de React memoiza lo derivado; no hace falta useMemo).
  let repartido: number[] = [];
  if (bultosValidos && pesoKg > 0) {
    try {
      repartido = repartirPeso(pesoKg, numBultos);
    } catch {
      // peso demasiado pequeño para tantos bultos: el schema y la base lo rechazan con su mensaje
    }
  }

  const pesosMostrados = pesosTxt ?? repartido.map(aTextoDecimal);
  const pesosNum = pesosTxt ? pesosTxt.map((t) => parsearDecimal(t) ?? Number.NaN) : null;
  const diferencia = pesosNum && pesosNum.every(Number.isFinite) ? diferenciaPesos(pesosNum, pesoKg) : null;

  const input: CompraFormInput = {
    tipoCafeId,
    terceroId: terceroId ?? "",
    fecha,
    pesoKg,
    numBultos,
    pesosBultos: pesosNum,
    precioKg,
    facturaProveedor: factura,
    observaciones,
  };
  const validacion = compraSchema.safeParse(input);
  const errores: Partial<Record<string, string>> = {};
  if (!validacion.success) {
    for (const issue of validacion.error.issues) {
      const clave = String(issue.path[0] ?? "");
      errores[clave] ??= issue.message;
    }
  }
  if (errorServidor) errores[errorServidor.campo] = errorServidor.mensaje;
  const error = (campo: string) => (intentado ? errores[campo] : undefined);

  // Cualquier cambio que altere el reparto devuelve los pesos por bulto a «partes iguales».
  const reiniciarPesos = () => setPesosTxt(null);

  function editarBulto(i: number, texto: string) {
    setPesosTxt((previos) => (previos ?? repartido.map(aTextoDecimal)).map((t, j) => (j === i ? texto : t)));
    setErrorServidor(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setIntentado(true);
    setErrorServidor(null);
    if (!validacion.success) {
      toast.error(validacion.error.issues[0]?.message ?? "Revisa los datos de la compra");
      return;
    }

    setEnviando(true);
    const r = await registrarCompra(input);
    setEnviando(false);
    if (!r.ok) {
      const campo = CAMPO_DE_ERROR[r.code];
      if (campo) setErrorServidor({ campo, mensaje: r.message });
      toast.error(r.message);
      return;
    }

    toast.success(`Compra registrada: ${r.data.codigo} · ${formatearCOP(r.data.valor_compra)}`, {
      action: { label: "Ver lote", onClick: () => router.push(`/dashboard/cafe/lotes/${r.data.id}`) },
    });
    router.push("/dashboard/cafe/lotes");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Proveedor y café</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="compra-tipo">Tipo de café</Label>
            <Select
              value={tipoCafeId}
              onValueChange={(v) => {
                setTipoCafeId(v);
                setErrorServidor(null);
              }}
            >
              <SelectTrigger id="compra-tipo" className="w-full text-base data-[size=default]:h-11 sm:data-[size=default]:h-10 sm:text-sm">
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="py-2.5 text-base sm:py-1.5 sm:text-sm">
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error("tipoCafeId") && <p className={ERROR}>{error("tipoCafeId")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Proveedor</Label>
            <div className="[&_button]:h-11 [&_button]:text-base sm:[&_button]:h-10 sm:[&_button]:text-sm">
              <TerceroCombobox
                value={terceroId}
                onChange={(id) => {
                  setTerceroId(id);
                  setErrorServidor(null);
                }}
                rol="proveedor"
                permitirCrear
                placeholder="Selecciona un proveedor"
              />
            </div>
            {error("terceroId") && <p className={ERROR}>{error("terceroId")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compra-fecha">Fecha de la compra</Label>
            <Input id="compra-fecha" type="date" max={fechaHoy} value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
            {error("fecha") && <p className={ERROR}>{error("fecha")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compra-factura">Nº de factura del proveedor (opcional)</Label>
            <Input id="compra-factura" value={factura} onChange={(e) => setFactura(e.target.value)} maxLength={60} className={CAMPO} />
            {error("facturaProveedor") && <p className={ERROR}>{error("facturaProveedor")}</p>}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Peso y precio</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="compra-bultos">Número de bultos</Label>
            <Input
              id="compra-bultos"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={numBultosTxt}
              onChange={(e) => {
                setNumBultosTxt(e.target.value);
                reiniciarPesos();
              }}
              className={CAMPO}
            />
            {error("numBultos") && <p className={ERROR}>{error("numBultos")}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="compra-peso">{modo === "bulto" ? "Peso por bulto (kg)" : "Peso total (kg)"}</Label>
              <button
                type="button"
                onClick={() => {
                  if (modo === "bulto") {
                    // Al pasar a «total» se conserva el peso que ya había calculado.
                    setPesoTotalTxt(pesoKg > 0 ? aTextoDecimal(pesoKg) : "");
                    setModo("total");
                  } else {
                    setModo("bulto");
                  }
                  reiniciarPesos();
                }}
                className="min-h-11 text-xs font-medium text-amber-700 underline-offset-2 hover:underline sm:min-h-0"
              >
                {modo === "bulto" ? "Digitar el peso total" : `Usar ${formatearKg(pesoBultoKg)} kg por bulto`}
              </button>
            </div>
            <Input
              id="compra-peso"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={modo === "bulto" ? aTextoDecimal(pesoBultoKg) : "Ej: 375"}
              value={modo === "bulto" ? pesoBultoTxt : pesoTotalTxt}
              onChange={(e) => {
                if (modo === "bulto") setPesoBultoTxt(e.target.value);
                else setPesoTotalTxt(e.target.value);
                reiniciarPesos();
              }}
              className={CAMPO}
            />
            {error("pesoKg") && <p className={ERROR}>{error("pesoKg")}</p>}
            {pesoKg > 0 && bultosValidos && (
              <p className="text-xs text-gray-500">
                {modo === "bulto"
                  ? `Total: ${formatearKg(pesoKg)} kg (${numBultos} × ${formatearKg(parsearDecimal(pesoBultoTxt) ?? 0)} kg)`
                  : `${formatearKg(pesoKg / numBultos)} kg por bulto en promedio`}
              </p>
            )}
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="compra-precio">Precio por kilo ($)</Label>
            <Input
              id="compra-precio"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej: 18500"
              value={precioTxt}
              onChange={(e) => {
                precioTocado.current = true;
                setPrecioTxt(e.target.value);
              }}
              className={cn(CAMPO, "md:max-w-xs")}
            />
            {error("precioKg") && <p className={ERROR}>{error("precioKg")}</p>}
            {sugerido !== null && (
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                Última compra a este proveedor: <span className="font-medium text-gray-700">{formatearCOP(sugerido)}/kg</span>
                {precioKg !== sugerido && (
                  <button
                    type="button"
                    onClick={() => setPrecioTxt(aTextoDecimal(sugerido))}
                    className="min-h-11 font-medium text-amber-700 underline-offset-2 hover:underline sm:min-h-0"
                  >
                    Usar este precio
                  </button>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3 rounded-md bg-amber-50 px-4 py-3" aria-live="polite">
          <span className="text-sm font-medium text-amber-900">Valor total</span>
          <span className="text-2xl font-bold tabular-nums text-amber-900">{formatearCOP(valorTotal)}</span>
        </div>

        <details className="group rounded-md border border-stone-200">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium text-gray-700 [&::-webkit-details-marker]:hidden">
            <span>
              Pesos por bulto
              {pesosTxt && <span className="ml-2 text-xs font-normal text-amber-700">corregidos a mano</span>}
            </span>
            <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-stone-200 p-3">
            {pesosMostrados.length === 0 ? (
              <p className="text-sm text-gray-500">Indica el número de bultos y el peso para ver el reparto.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {pesosMostrados.map((texto, i) => (
                    <div key={i} className="space-y-1">
                      <Label htmlFor={`compra-bulto-${i + 1}`} className="text-xs text-gray-500">
                        Bulto {i + 1}
                      </Label>
                      <Input
                        id={`compra-bulto-${i + 1}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={texto}
                        onChange={(e) => editarBulto(i, e.target.value)}
                        className={cn(CAMPO, "tabular-nums")}
                      />
                    </div>
                  ))}
                </div>
                {diferencia !== null && diferencia !== 0 ? (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Los bultos suman {formatearKg(sumaPesos(pesosNum ?? []))} kg: {diferencia < 0 ? "faltan" : "sobran"}{" "}
                    {formatearKg(Math.abs(diferencia))} kg para llegar a {formatearKg(pesoKg)} kg.
                  </p>
                ) : (
                  pesosTxt && <p className="text-sm text-green-700">Los bultos suman {formatearKg(pesoKg)} kg.</p>
                )}
                {error("pesosBultos") && <p className={ERROR}>{error("pesosBultos")}</p>}
                {pesosTxt && (
                  <Button type="button" variant="outline" onClick={reiniciarPesos} className="h-11 sm:h-9">
                    Repartir en partes iguales
                  </Button>
                )}
              </>
            )}
          </div>
        </details>

        <div className="space-y-1.5">
          <Label htmlFor="compra-observaciones">Observaciones (opcional)</Label>
          <Textarea id="compra-observaciones" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="text-base sm:text-sm" />
          {error("observaciones") && <p className={ERROR}>{error("observaciones")}</p>}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/cafe/lotes")} disabled={enviando} className="h-11 sm:h-10">
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando} className="h-11 sm:h-10">
          {enviando ? "Guardando…" : "Registrar compra"}
        </Button>
      </div>
    </form>
  );
}
