"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatearKg } from "../../compras/lib/compra";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import { diaCorto } from "../lib/formato";
import { COLOR_PROCESO, TIPOS_PROCESO, type PuntoKg } from "../lib/series";
import { MarcoGrafico } from "./marco-grafico";

/** Gráfico 1: kg que entraron a cada proceso por día (barras agrupadas por tipo de proceso). */
export function GraficoProduccion({ datos }: { datos: PuntoKg[] }) {
  const hayDatos = datos.some((d) => TIPOS_PROCESO.some((t) => d[t] > 0));
  return (
    <MarcoGrafico titulo="Kg procesados por día" subtitulo="kilos de entrada de cada proceso" vacio={!hayDatos} textoVacio="Sin procesos en este periodo">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={datos} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="fecha" tickFormatter={diaCorto} tick={{ fontSize: 11 }} minTickGap={14} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={(v: number) => formatearKg(v)} />
          <Tooltip
            labelFormatter={(f) => diaCorto(String(f))}
            formatter={(valor, nombre) => [`${formatearKg(Number(valor))} kg`, String(nombre)]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {TIPOS_PROCESO.map((t) => (
            <Bar key={t} dataKey={t} name={etiquetaServicio(t)} fill={COLOR_PROCESO[t]} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </MarcoGrafico>
  );
}
