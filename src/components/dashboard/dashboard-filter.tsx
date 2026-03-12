"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const START_YEAR = 2024;

interface DashboardFilterProps {
  mes: number;
  anio: number;
}

export function DashboardFilter({ mes, anio }: DashboardFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) => START_YEAR + i);

  return (
    <div className="flex items-center gap-2">
      <Select value={String(mes)} onValueChange={(v) => update("mes", v)}>
        <SelectTrigger className="w-36 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MESES.map((label, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={String(anio)} onValueChange={(v) => update("anio", v)}>
        <SelectTrigger className="w-24 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
