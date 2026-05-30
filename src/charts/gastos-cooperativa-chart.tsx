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

interface GastoMensual {
  fecha: string;   // YYYY-MM-DD
  litros: number;
  precio_litro: number;
}

interface GastosCooperativaChartProps {
  data: GastoMensual[];
}

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

export function GastosCooperativaChart({ data }: GastosCooperativaChartProps) {
  // Agrupa por mes sumando litros × precio_litro
  const monthMap = new Map<string, number>();
  data.forEach(({ fecha, litros, precio_litro }) => {
    const key = fecha.slice(0, 7); // YYYY-MM
    monthMap.set(key, (monthMap.get(key) ?? 0) + litros * precio_litro);
  });

  const chartData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, gasto]) => {
      const [year, month] = key.split("-");
      return {
        label: `${MESES[parseInt(month, 10) - 1]} ${year}`,
        gasto: Math.round(gasto),
      };
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-gray-700">
          Compras leche por mes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Sin datos
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v) =>
                  `$${(v / 1000).toFixed(0)}k`
                }
              />
              <Tooltip
                formatter={(value) => [
                  `$${Number(value).toLocaleString("es-CO", { minimumFractionDigits: 0 })}`,
                  "Gasto",
                ]}
              />
              <Line
                type="monotone"
                dataKey="gasto"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3, fill: "#ef4444" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
