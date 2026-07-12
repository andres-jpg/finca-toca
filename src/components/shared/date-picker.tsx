"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder?: string;
  /** Año de inicio para el dropdown de años. Por defecto 30 años atrás. */
  fromYear?: number;
  /** Si es true, no permite seleccionar fechas futuras (posteriores a hoy). */
  disableFuture?: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

export function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  fromYear = CURRENT_YEAR - 30,
  disableFuture = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "dd/MM/yyyy", { locale: es }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            if (date) {
              onChange(date);
              setOpen(false);
            }
          }}
          disabled={disableFuture ? { after: new Date() } : undefined}
          locale={es}
          captionLayout="dropdown"
          startMonth={new Date(fromYear, 0)}
          endMonth={disableFuture ? new Date() : new Date(CURRENT_YEAR, 11)}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
