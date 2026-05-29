"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FincaCooperativa } from "@/types";

interface FincaComboboxProps {
  fincas: FincaCooperativa[];
  value: number | null;
  onChange: (id: number) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function FincaCombobox({
  fincas,
  value,
  onChange,
  placeholder = "Selecciona una finca",
  disabled = false,
}: FincaComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = fincas.find((f) => f.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.nombre : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar finca..." />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            {fincas.map((f) => (
              <CommandItem
                key={f.id}
                value={f.nombre}
                onSelect={() => {
                  onChange(f.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === f.id ? "opacity-100" : "opacity-0"
                  )}
                />
                {f.nombre}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
