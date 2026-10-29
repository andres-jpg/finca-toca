"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatearPct } from "../../lotes/lib/formato";
import { diaCorto } from "../lib/formato";
import { COLOR_PROCESO, type PuntoMerma } from "../lib/series";
import { MarcoGrafico } from "./marco-grafico";

interface Props {
  datos: PuntoMerma[];
  /** Merma de referencia vigente (%), la línea discontinua de cada proceso. */
  referencias: { trilla: number; tostion: number };
}

/** Gráfico 2: merma ponderada de trilla y tostión por día. Los días sin procesos de ese tipo quedan como hueco, no como 0 %. */
export function GraficoMerma({ datos, referencias }: Props) {
  const hayDatos = datos.some((d) => d.trilla !== null || d.tostion !== null);
  return (
    <MarcoGrafico titulo="Merma por día" subtitulo="trilla y tostión · la línea discontinua es la referencia" vacio={!hayDatos} textoVacio="Sin trilla ni tostión en este periodo">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={datos} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="fecha" tickFormatter={diaCorto} tick={{ fontSize: 11 }} minTickGap={14} />
          <YAxis tick={{ fontSize: 11 }} width={44} unit=" %" domain={[0, (max: number) => Math.max(25, Math.ceil(max + 2))]} />
          <Tooltip
            labelFormatter={(f) => diaCorto(String(f))}
            formatter={(valor, nombre) => [formatearPct(Number(valor)), String(nombre)]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={referencias.trilla} stroke={COLOR_PROCESO.trilla} strokeDasharray="6 4" label={{ value: `Ref. trilla ${referencias.trilla} %`, position: "insideTopLeft", fontSize: 10, fill: COLOR_PROCESO.trilla }} />
          <ReferenceLine y={referencias.tostion} stroke={COLOR_PROCESO.tostion} strokeDasharray="6 4" label={{ value: `Ref. tostión ${referencias.tostion} %`, position: "insideBottomLeft", fontSize: 10, fill: COLOR_PROCESO.tostion }} />
          <Line type="monotone" dataKey="trilla" name="Trilla" stroke={COLOR_PROCESO.trilla} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          <Line type="monotone" dataKey="tostion" name="Tostión" stroke={COLOR_PROCESO.tostion} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </MarcoGrafico>
  );
}
