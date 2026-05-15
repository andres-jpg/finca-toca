"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TrendPoint {
  fecha: string;
  litros: number;
}

interface RecoleccionesTrendChartProps {
  data: TrendPoint[];
  mes: number;
  anio: number;
}

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

export function RecoleccionesTrendChart({
  data,
  mes,
  anio,
}: RecoleccionesTrendChartProps) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `${anio}-${pad(mes)}`;

  const diaMap = new Map<number, number>();
  data
    .filter((d) => d.fecha.startsWith(prefix))
    .forEach((d) => {
      const dia = parseInt(d.fecha.slice(8, 10), 10);
      diaMap.set(dia, (diaMap.get(dia) ?? 0) + d.litros);
    });

  const chartData = Array.from(diaMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([dia, litros]) => ({ dia, litros }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-gray-700">
          Litros por día — {MESES[mes - 1]} {anio}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Sin datos para este mes
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="dia"
                tickFormatter={(v) => `${v}`}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v) => `${v}L`}
              />
              <Tooltip
                formatter={(value) => [
                  `${Number(value).toLocaleString("es-CO", { minimumFractionDigits: 1 })} L`,
                  "Litros",
                ]}
                labelFormatter={(label) => `Día ${label}`}
              />
              <Line
                type="monotone"
                dataKey="litros"
                stroke="#0d9488"
                strokeWidth={2}
                dot={{ r: 3, fill: "#0d9488" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
