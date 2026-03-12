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
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ExtraccionesLineChartProps {
  extracciones: { fecha: string; litros: number }[];
  hasFilter: boolean;
  mes: number;
  anio: number;
}

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function buildMonthlyData(extracciones: { fecha: string; litros: number }[]) {
  const map = new Map<string, number>();
  extracciones.forEach(({ fecha, litros }) => {
    const key = fecha.slice(0, 7); // YYYY-MM
    map.set(key, (map.get(key) ?? 0) + litros);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, litros]) => {
      const [year, month] = key.split("-");
      return { label: `${MESES[parseInt(month, 10) - 1]} ${year}`, litros };
    });
}

function buildDailyData(
  extracciones: { fecha: string; litros: number }[],
  mes: number,
  anio: number
) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = `${anio}-${pad(mes)}`;
  const map = new Map<number, number>();
  extracciones
    .filter(({ fecha }) => fecha.startsWith(prefix))
    .forEach(({ fecha, litros }) => {
      const day = parseInt(fecha.slice(8, 10), 10);
      map.set(day, (map.get(day) ?? 0) + litros);
    });
  const daysInMonth = new Date(anio, mes, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => ({
    label: String(i + 1),
    litros: map.get(i + 1) ?? 0,
  }));
}

export function ExtraccionesLineChart({
  extracciones,
  hasFilter,
  mes,
  anio,
}: ExtraccionesLineChartProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const chartData = hasFilter
    ? buildDailyData(extracciones, mes, anio)
    : buildMonthlyData(extracciones);

  const subtitle = hasFilter
    ? `${MESES[mes - 1]} ${anio} — litros por día`
    : "Histórico — litros por mes";

  const hasData = chartData.some((d) => d.litros > 0);

  const commonAxis = {
    xAxis: (
      <XAxis
        dataKey="label"
        tick={{ fontSize: hasFilter ? 10 : 11, fill: "#6b7280" }}
        tickLine={{ stroke: "#e5e7eb" }}
        interval={hasFilter ? 1 : 0}
      />
    ),
    yAxis: (
      <YAxis
        tick={{ fontSize: 11, fill: "#6b7280" }}
        tickLine={{ stroke: "#e5e7eb" }}
        tickFormatter={(v: number) => `${v}L`}
        width={40}
      />
    ),
    tooltip: (
      <Tooltip
        formatter={(value: unknown) => [`${Number(value).toFixed(1)} L`, "Litros"]}
        contentStyle={{
          backgroundColor: "white",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          padding: "8px 12px",
        }}
      />
    ),
    grid: <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />,
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base font-medium">Extracciones de leche</CardTitle>
        <p className="text-xs text-stone-400 -mt-1">{subtitle}</p>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {!hasData ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay datos de extracciones</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            {isMobile ? (
              <BarChart data={chartData}>
                {commonAxis.grid}
                {commonAxis.xAxis}
                {commonAxis.yAxis}
                {commonAxis.tooltip}
                <Bar dataKey="litros" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                {commonAxis.grid}
                {commonAxis.xAxis}
                {commonAxis.yAxis}
                {commonAxis.tooltip}
                <Line
                  type="monotone"
                  dataKey="litros"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
