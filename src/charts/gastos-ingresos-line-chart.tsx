"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base font-medium">Gastos vs Ingresos</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay datos</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            {isMobile ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={{ stroke: '#e5e7eb' }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: unknown) =>
                    `$${Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                  }
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    padding: "8px 12px",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '13px' }}
                  iconType="circle"
                />
                <Bar dataKey="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={{ stroke: '#e5e7eb' }}
                />
                <Tooltip
                  formatter={(value: unknown) =>
                    `$${Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                  }
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    padding: "8px 12px",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '14px' }}
                  iconType="line"
                />
                <Line
                  type="monotone"
                  dataKey="Ingresos"
                  stroke="#22c55e"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#22c55e", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 7 }}
                />
                <Line
                  type="monotone"
                  dataKey="Gastos"
                  stroke="#ef4444"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#ef4444", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
