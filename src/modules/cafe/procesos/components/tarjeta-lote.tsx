import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LineaBadge } from "../../components/linea-badge";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import { horaLlegada } from "../../lotes/lib/formato";
import { textoPerfilTueste } from "../../lotes/lib/perfil-tueste";
import { ETIQUETA_ALERTA_CALIDAD } from "../../recepciones/lib/calidad";
import { CTA_PASO, chipsServicios, diasEntre, textoListoHace, type EntradaTablero } from "../lib/cola";
import { fechaCorta, formatearPeso } from "../lib/numero";
import { NOTA_EMPAQUE_MARCA_PROPIA } from "../lib/pasos";
import { rutaEntregar } from "../../remisiones/lib/estado";
import { NivelTuesteChip } from "./nivel-tueste-chip";

const ESTILO_CHIP = {
  hecho: "border-gray-800 bg-gray-800 text-white",
  actual: "border-gray-800 bg-white text-gray-900",
  futuro: "border-gray-200 bg-gray-100 text-gray-500",
} as const;
const ETIQUETA_CHIP = { hecho: "hecho", actual: "pendiente", futuro: "después" } as const;

/**
 * Tarjeta del tablero de planta: todo es un solo objetivo táctil (el enlace a la pantalla del proceso, o a «Entregar»
 * (A-14, con el lote preseleccionado) en «Por entregar»). Línea · código · cliente o calidad · kg y estado ·
 * perfil · llegada · chips de servicios (hecho = relleno oscuro, actual = contorno, futuro = gris) · CTA.
 * Los avisos de calidad y desvío avisan, no bloquean. Nada depende del hover.
 */
export function TarjetaLote({ entrada, zonaHoraria, hoy }: { entrada: EntradaTablero; zonaHoraria: string; hoy: string }) {
  const { tarjeta: lote, columna, pendientes, total } = entrada;
  const porEntregar = columna === "entrega";
  const parcial = !porEntregar && pendientes < total - 0.05;
  const alertas = [...lote.alertasCalidad.map((a) => ETIQUETA_ALERTA_CALIDAD[a] ?? a), ...(lote.tieneDesvio ? ["Merma desviada"] : [])];
  const href = porEntregar ? rutaEntregar(lote.id) : `/dashboard/cafe/planta/${lote.id}`;
  const dias = porEntregar && lote.listoDesde ? diasEntre(lote.listoDesde, hoy) : null;
  const chips = chipsServicios(lote, columna);

  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-32 flex-col gap-2.5 rounded-lg border bg-white p-3.5 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gray-900",
        porEntregar ? "border-2 border-amber-500" : "border-gray-200 hover:border-gray-400",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LineaBadge linea={lote.linea} />
        {parcial && <span className="text-xs font-medium text-gray-600 tabular-nums">{formatearPeso(pendientes)} kg por procesar · de {formatearPeso(total)} kg</span>}
      </div>

      <div className="min-w-0">
        <p className="text-xl font-bold tracking-tight text-gray-900 tabular-nums">{lote.codigo}</p>
        <p className="truncate text-sm text-gray-700">
          {lote.tercero}
          {lote.tipoCafe && <span className="text-gray-500"> · {lote.tipoCafe}</span>}
        </p>
      </div>

      <p className="text-sm text-gray-600">
        <span className="font-semibold tabular-nums text-gray-900">{formatearPeso(lote.pesoActualKg)} kg</span> · {lote.estado === "listo" ? "Listo" : lote.estado === "parcial" ? "Parcial" : lote.estado === "en_proceso" ? "En proceso" : "Recibido"}
        {lote.avanceTexto && <span className="text-gray-500"> · {lote.avanceTexto}</span>}
      </p>

      {(lote.nivelTueste || lote.perfilTempC != null || lote.perfilTiempoMin != null) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
          {lote.nivelTueste && <NivelTuesteChip nivel={lote.nivelTueste} />}
          {(lote.perfilTempC != null || lote.perfilTiempoMin != null) && (
            <span>{textoPerfilTueste({ nivel: lote.nivelTueste, tempC: lote.perfilTempC, tiempoMin: lote.perfilTiempoMin })}</span>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Recibido {fechaCorta(lote.fechaRecepcion)} · llegó {horaLlegada(lote.llegadaEn, zonaHoraria)}
      </p>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Servicios">
          {chips.map((c) => (
            <li key={c.tipo} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", ESTILO_CHIP[c.estado])}>
              {etiquetaServicio(c.tipo)} <span className="sr-only">({ETIQUETA_CHIP[c.estado]})</span>
            </li>
          ))}
        </ul>
      )}

      {lote.linea === "marca_propia" && columna === "empaque" && <p className="text-xs text-gray-500">{NOTA_EMPAQUE_MARCA_PROPIA}</p>}

      {alertas.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Alertas">
          {alertas.map((a) => (
            <li key={a} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {a}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        {dias !== null ? <span className="text-sm font-medium text-gray-700">{textoListoHace(dias)}</span> : <span />}
        <span className="inline-flex min-h-11 items-center rounded-md bg-gray-900 px-4 text-base font-semibold text-white">
          {porEntregar ? "Entregar" : `${CTA_PASO[columna]} →`}
        </span>
      </div>
    </Link>
  );
}
