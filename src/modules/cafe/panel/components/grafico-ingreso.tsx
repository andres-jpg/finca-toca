"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from "recharts";
import { formatCOP } from "@/modules/core/formato/numeros";
import { diaCorto, millonesTexto } from "../lib/formato";
import type { PuntoIngreso } from "../lib/series";
import { MarcoGrafico } from "./marco-grafico";

const COLOR_MARCA = "#b45309";
const COLOR_SERVICIOS = "#0284c7";

interface EtiquetaProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: unknown;
}

/** El total del día sobre la barra apilada, en millones con 1 decimal. Los días sin ingreso no llevan etiqueta. */
function EtiquetaTotal({ x = 0, y = 0, width = 0, value }: EtiquetaProps) {
  const total = Number(value ?? 0);
  if (!(total > 0)) return null;
  return (
    <text x={Number(x) + Number(width) / 2} y={Number(y) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#44403c">
      {millonesTexto(total)}
    </text>
  );
}

/**
 * Ingreso diario de los últimos 14 días: barras apiladas marca propia / servicios a terceros con el total sobre cada barra
 * (millones, 1 decimal) y leyenda. Un solo eje (en millones): sin doble eje. El acumulado del periodo va en el encabezado.
 */
export function GraficoIngreso({ datos, acumulado, etiquetaAcumulado }: { datos: PuntoIngreso[]; acumulado: number; etiquetaAcumulado: string }) {
  const hayDatos = datos.some((d) => d.total > 0);
  return (
    <MarcoGrafico
      titulo="Ingresos diarios · últimos 14 días"
      subtitulo={`${etiquetaAcumulado}: ${formatCOP(acumulado)} · cifras en millones de pesos`}
      vacio={!hayDatos}
      textoVacio="Sin ingresos en estos 14 días"
    >
      <div data-testid="grafico-ingreso">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={datos} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="fecha" tickFormatter={diaCorto} tick={{ fontSize: 11 }} minTickGap={8} />
            <YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={(v: number) => millonesTexto(v)} />
            <Tooltip
              labelFormatter={(f) => diaCorto(String(f))}
              formatter={(valor, nombre) => [formatCOP(Number(valor)), String(nombre)]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="marcaPropia" name="Ventas marca propia" stackId="ingreso" fill={COLOR_MARCA} />
            <Bar dataKey="servicios" name="Servicios a terceros" stackId="ingreso" fill={COLOR_SERVICIOS} radius={[2, 2, 0, 0]}>
              <LabelList dataKey="total" content={EtiquetaTotal} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </MarcoGrafico>
  );
}
