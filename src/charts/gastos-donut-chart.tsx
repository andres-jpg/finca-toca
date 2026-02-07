"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Label,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GastoRow {
  concepto: string;
  valor: number;
}

interface GastosDonutChartProps {
  gastos: GastoRow[];
}

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];

const renderCustomLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
}: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.3;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  // Acortar nombres largos
  const shortName = name.length > 12 ? name.substring(0, 10) + '...' : name;

  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize="13"
      fontWeight="500"
    >
      {`${shortName} ${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export function GastosDonutChart({ gastos }: GastosDonutChartProps) {
  const conceptoMap = new Map<string, number>();
  gastos.forEach((g) => {
    conceptoMap.set(g.concepto, (conceptoMap.get(g.concepto) ?? 0) + g.valor);
  });

  const chartData = Array.from(conceptoMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base font-medium">Gastos por concepto</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay datos de gastos</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                label={renderCustomLabel}
                labelLine={{ stroke: "#d1d5db", strokeWidth: 1 }}
              >
                {chartData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
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
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
