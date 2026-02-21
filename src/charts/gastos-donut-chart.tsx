"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GastoRow {
  concepto: string;
  valor: number;
}

interface GastosDonutChartProps {
  gastos: GastoRow[];
}

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];

export function GastosDonutChart({ gastos }: GastosDonutChartProps) {
  const conceptoMap = new Map<string, number>();
  gastos.forEach((g) => {
    conceptoMap.set(g.concepto, (conceptoMap.get(g.concepto) ?? 0) + g.valor);
  });

  const total = Array.from(conceptoMap.values()).reduce((a, b) => a + b, 0);

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
          <div className="flex flex-col items-center gap-4">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: unknown) =>
                    `$${Number(value).toLocaleString("es-CO", { minimumFractionDigits: 0 })}`
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
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 28px", width: "100%", padding: "0 16px 8px" }}>
              {chartData.map((entry, index) => (
                <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <div
                    style={{
                      backgroundColor: COLORS[index % COLORS.length],
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      flexShrink: 0,
                    }}
                  />
                  <span className="text-sm text-gray-600 whitespace-nowrap">
                    {entry.name}{" "}
                    <span className="font-semibold text-gray-800">
                      {((entry.value / total) * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
