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

interface LitrosPorDiaSerieChartProps {
  title: string;
  data: Record<string, number>[]; // { dia: number, [serie]: litros }
  series: string[];
}

const COLORS = [
  "#0d9488", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899",
  "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#ef4444",
];

export function LitrosPorDiaSerieChart({ title, data, series }: LitrosPorDiaSerieChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-gray-700">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 || series.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-gray-400">
            Sin datos para este mes
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
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
                formatter={(value, name) => [
                  `${Number(value).toLocaleString("es-CO", { minimumFractionDigits: 1 })} L`,
                  name,
                ]}
                labelFormatter={(label) => `Día ${label}`}
                wrapperStyle={{ zIndex: 50 }}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  padding: "8px 12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s, i) => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  name={s}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
