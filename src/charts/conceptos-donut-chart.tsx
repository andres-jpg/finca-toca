"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DataRow {
  concepto: string;
  valor: number;
}

interface ConceptosDonutChartProps {
  gastos: DataRow[];
  ingresos: DataRow[];
}

const COLORS_GASTOS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
const COLORS_INGRESOS = ["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#ef4444"];

function buildChartData(rows: DataRow[]) {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    map.set(r.concepto, (map.get(r.concepto) ?? 0) + r.valor);
  });
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  const data = Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  return { data, total };
}

export function ConceptosDonutChart({ gastos, ingresos }: ConceptosDonutChartProps) {
  const [view, setView] = useState<"gastos" | "ingresos">("gastos");

  const isGastos = view === "gastos";
  const { data: chartData, total } = buildChartData(isGastos ? gastos : ingresos);
  const COLORS = isGastos ? COLORS_GASTOS : COLORS_INGRESOS;
  const emptyMsg = isGastos ? "No hay datos de gastos" : "No hay datos de ingresos";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Select value={view} onValueChange={(v) => setView(v as "gastos" | "ingresos")}>
            <SelectTrigger className="w-auto border-none shadow-none p-0 h-auto text-base font-semibold text-stone-900 focus:ring-0 gap-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gastos">Gastos por concepto</SelectItem>
              <SelectItem value="ingresos">Ingresos por concepto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-12">{emptyMsg}</p>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={85}
                  outerRadius={125}
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
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "8px 36px",
                width: "100%",
                padding: "0 16px 8px",
              }}
            >
              {chartData.map((entry, index) => (
                <div
                  key={entry.name}
                  style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
                >
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
