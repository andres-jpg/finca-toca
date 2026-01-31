"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
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

interface MilkingDataPoint {
  date: string;
  liters: number;
}

interface ChartRow {
  date: string;
  liters: number;
  label: string;
}

interface MilkingLineChartProps {
  data: MilkingDataPoint[];
}

export function MilkingLineChart({ data }: MilkingLineChartProps) {
  const chartData: ChartRow[] = data.map((d) => ({
    date: d.date,
    liters: d.liters,
    label: format(new Date(d.date + "T00:00:00"), "dd/MM", { locale: es }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Litros por día (últimos 30 días)</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No hay datos de ordeños</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                labelFormatter={(_label: unknown, payload?: readonly unknown[]) => {
                  if (payload && payload.length > 0) {
                    const entry = payload[0] as { payload?: ChartRow };
                    if (entry.payload) {
                      return format(new Date(entry.payload.date + "T00:00:00"), "dd/MM/yyyy", { locale: es });
                    }
                  }
                  return String(_label);
                }}
                formatter={(value: unknown) => [`${Number(value).toFixed(1)} L`, "Litros"]}
              />
              <Line
                type="monotone"
                dataKey="liters"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
