"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

interface DateRangePickerProps {
  from: Date;
  to: Date;
  onChange: (range: { from: Date; to: Date }) => void;
  /** Por defecto bloquea fechas futuras: casi todos los rangos de esta app son sobre historial ya cerrado. */
  disableFuture?: boolean;
}

export function DateRangePicker({ from, to, onChange, disableFuture = true }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  // Borrador local: react-day-picker en modo "range" reporta un from-sin-to tras el
  // primer clic, y solo se confirma (onChange) cuando el segundo clic completa el rango.
  const [draft, setDraft] = useState<DateRange | undefined>({ from, to });

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft({ from, to });
    setOpen(next);
  };

  const handleSelect = (range: DateRange | undefined) => {
    setDraft(range);
    if (range?.from && range?.to) {
      onChange({ from: range.from, to: range.to });
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start text-left font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {format(from, "dd/MM/yyyy", { locale: es })} – {format(to, "dd/MM/yyyy", { locale: es })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={draft}
          onSelect={handleSelect}
          disabled={disableFuture ? { after: new Date() } : undefined}
          locale={es}
          numberOfMonths={2}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
