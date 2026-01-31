"use client";

import {
  BarChart,
  Bar,
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

interface GastosIngresosBarChartProps {
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

export function GastosInbresosBarChart({ gastos, ingresos }: GastosIngresosBarChartProps) {
  const monthMap = new Map<string, { gastos: number; ingresos: number }>();

  gastos.forEach((g) => {
    const key = getMonthKey(g.fecha);
    const entry = monthMap.get(key) ?? { gastos: 0, ingresos: 0 };
    entry.gastos += g.valor;
    monthMap.set(key, entry);
  });

  ingresos.forEach((i) => {
    const key = getMonthKey(i.fecha);
    const entry = monthMap.get(key) ?? { gastos: 0, ingresos: 0 };
    entry.ingresos += i.valor;
    monthMap.set(key, entry);
  });

  const chartData = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({
      month: getMonthLabel(key),
      Gastos: val.gastos,
      Ingresos: val.ingresos,
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Gastos vs Ingresos por mes</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay datos</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: unknown) => `$${Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`} />
              <Legend />
              <Bar dataKey="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
