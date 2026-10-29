"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatearCOP } from "../../compras/lib/compra";
import { abreviarCOP, diaCorto } from "../lib/formato";
import type { PuntoIngreso } from "../lib/series";
import type { LineaPanel } from "../types";
import { MarcoGrafico } from "./marco-grafico";

const COLOR_MARCA = "#b45309";
const COLOR_SERVICIOS = "#0284c7";

/**
 * Gráfico 3: ingreso diario, marca propia (ventas) frente a servicios (valor de los procesos). Con «Todo» las barras se
 * apilan; con una línea elegida solo se pinta la serie que le corresponde.
 */
export function GraficoIngreso({ datos, linea }: { datos: PuntoIngreso[]; linea: LineaPanel | null }) {
  const verMarca = linea === null || linea === "marca_propia";
  const verServicios = linea === null || linea !== "marca_propia";
  const hayDatos = datos.some((d) => (verMarca && d.marcaPropia > 0) || (verServicios && d.servicios > 0));
  const apilado = verMarca && verServicios ? "ingreso" : undefined;
  return (
    <MarcoGrafico
      titulo="Ingreso diario"
      subtitulo={linea === null ? "marca propia (ventas) y servicios (procesos), apilados" : linea === "marca_propia" ? "ventas de marca propia" : "valor de los servicios"}
      vacio={!hayDatos}
      textoVacio="Sin ingresos en este periodo"
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={datos} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="fecha" tickFormatter={diaCorto} tick={{ fontSize: 11 }} minTickGap={14} />
          <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v: number) => abreviarCOP(v)} />
          <Tooltip
            labelFormatter={(f) => diaCorto(String(f))}
            formatter={(valor, nombre) => [formatearCOP(Number(valor)), String(nombre)]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          {apilado && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {verMarca && <Bar dataKey="marcaPropia" name="Marca propia" stackId={apilado} fill={COLOR_MARCA} />}
          {verServicios && <Bar dataKey="servicios" name="Servicios" stackId={apilado} fill={COLOR_SERVICIOS} radius={[2, 2, 0, 0]} />}
        </BarChart>
      </ResponsiveContainer>
    </MarcoGrafico>
  );
}
