"use client";

import { AlertTriangle } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPct } from "@/modules/core/formato/numeros";
import { diaCorto } from "../lib/formato";
import { COLOR_PROCESO, type PuntoMermaTostion } from "../lib/series";
import { MarcoGrafico } from "./marco-grafico";

interface Props {
  datos: PuntoMermaTostion[];
  /** Referencia vigente (%); `null` cuando los tres niveles de tueste difieren y no hay una banda única. */
  referenciaPct: number | null;
  toleranciaPts: number;
}

const ROJO = "#b91c1c";
const AMBAR = "#d97706";

const TEXTO_ESTADO = { alta: "alta", baja: "baja", en_rango: "en rango" } as const;

/** Punto del día: en rango, el color de la línea; alta, círculo rojo; baja, rombo ámbar (forma y color, no solo color). */
function Punto(props: { cx?: number; cy?: number; payload?: PuntoMermaTostion }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload || payload.pct === null) return <g />;
  if (payload.estado === "alta") return <circle cx={cx} cy={cy} r={6} fill={ROJO} stroke="#fff" strokeWidth={1.5} />;
  if (payload.estado === "baja") return <rect x={cx - 5} y={cy - 5} width={10} height={10} fill={AMBAR} stroke="#fff" strokeWidth={1.5} transform={`rotate(45 ${cx} ${cy})`} />;
  return <circle cx={cx} cy={cy} r={3} fill={COLOR_PROCESO.tostion} />;
}

/**
 * «Merma de tostión por día» (A-19): línea de la merma ponderada de cada día con la banda de referencia (ref ± tolerancia,
 * A-03) sombreada. Los días fuera de la banda se marcan en rojo (alta) o ámbar (baja) con forma distinta y se listan debajo
 * con texto. Los días sin tostión son un hueco. Solo avisa.
 */
export function GraficoMermaTostion({ datos, referenciaPct, toleranciaPts }: Props) {
  const hayDatos = datos.some((d) => d.pct !== null);
  const fuera = datos.filter((d) => d.estado === "alta" || d.estado === "baja");
  const bajo = referenciaPct === null ? null : referenciaPct - toleranciaPts;
  const alto = referenciaPct === null ? null : referenciaPct + toleranciaPts;
  const subtitulo =
    referenciaPct === null
      ? "ponderada por día · los niveles de tueste tienen referencias distintas: sin banda"
      : `ponderada por día · banda: referencia ${formatPct(referenciaPct)} ± ${toleranciaPts} pts`;

  return (
    <MarcoGrafico titulo="Merma de tostión por día" subtitulo={subtitulo} vacio={!hayDatos} textoVacio="Sin tostión en este periodo">
      <div data-testid="grafico-merma-tostion">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={datos} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="fecha" tickFormatter={diaCorto} tick={{ fontSize: 11 }} minTickGap={14} />
            <YAxis
              tick={{ fontSize: 11 }}
              width={44}
              unit=" %"
              domain={[
                (min: number) => Math.max(0, Math.floor(Math.min(min, bajo ?? min) - 2)),
                (max: number) => Math.ceil(Math.max(max, alto ?? max) + 2),
              ]}
            />
            {bajo !== null && alto !== null && referenciaPct !== null && (
              <>
                <ReferenceArea y1={bajo} y2={alto} fill="#78716c" fillOpacity={0.12} stroke="none" ifOverflow="extendDomain" />
                <ReferenceLine y={referenciaPct} stroke={COLOR_PROCESO.tostion} strokeDasharray="6 4" label={{ value: `Ref. ${referenciaPct} %`, position: "insideTopLeft", fontSize: 10, fill: COLOR_PROCESO.tostion }} />
              </>
            )}
            <Tooltip
              labelFormatter={(f) => diaCorto(String(f))}
              formatter={(valor, _nombre, item) => {
                const estado = (item.payload as PuntoMermaTostion | undefined)?.estado;
                return [`${formatPct(Number(valor))}${estado ? ` · ${TEXTO_ESTADO[estado]}` : ""}`, "Tostión"];
              }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Line type="monotone" dataKey="pct" name="Tostión" stroke={COLOR_PROCESO.tostion} strokeWidth={2} dot={<Punto />} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {fuera.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm" aria-label="Días fuera de la banda">
          {fuera.map((d) => (
            <li key={d.fecha} className={d.estado === "alta" ? "flex items-center gap-1.5 text-red-700" : "flex items-center gap-1.5 text-amber-700"}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="tabular-nums">
                {diaCorto(d.fecha)} · {formatPct(d.pct)} · {d.estado === "alta" ? "Revisar · alta" : "Verificar · baja"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </MarcoGrafico>
  );
}
