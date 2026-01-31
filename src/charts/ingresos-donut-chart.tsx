"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface IngresoRow {
  concepto: string;
  valor: number;
}

interface IngresosDonutChartProps {
  ingresos: IngresoRow[];
}

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#ef4444"];

export function IngresosDonutChart({ ingresos }: IngresosDonutChartProps) {
  const conceptoMap = new Map<string, number>();
  ingresos.forEach((i) => {
    conceptoMap.set(i.concepto, (conceptoMap.get(i.concepto) ?? 0) + i.valor);
  });

  const chartData = Array.from(conceptoMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Ingresos por concepto</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay datos de ingresos</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
                labelLine={true}
              >
                {chartData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: unknown) =>
                  `$${Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                }
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
