"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GastoRow {
  fecha: string;
  valor: number;
}

interface IngresoRow {
  fecha: string;
  valor: number;
}

interface GastosIngresosLineChartProps {
  gastos: GastoRow[];
  ingresos: IngresoRow[];
}

function getMonthKey(dateStr: string) {
  return dateStr.slice(0, 7);
}

function getMonthLabel(key: string) {
  const [year, month] = key.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

export function GastosIngresosLineChart({ gastos, ingresos }: GastosIngresosLineChartProps) {
  const monthMap = new Map<string, { Gastos: number; Ingresos: number }>();

  gastos.forEach((g) => {
    const key = getMonthKey(g.fecha);
    const entry = monthMap.get(key) ?? { Gastos: 0, Ingresos: 0 };
    entry.Gastos += g.valor;
    monthMap.set(key, entry);
  });

  ingresos.forEach((i) => {
    const key = getMonthKey(i.fecha);
    const entry = monthMap.get(key) ?? { Gastos: 0, Ingresos: 0 };
    entry.Ingresos += i.valor;
    monthMap.set(key, entry);
  });

  const chartData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({
      month: getMonthLabel(key),
      ...val,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Gastos vs Ingresos</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay datos</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: unknown) =>
                  `$${Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                }
              />
              <Legend />
              <Line type="monotone" dataKey="Ingresos" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Gastos" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
