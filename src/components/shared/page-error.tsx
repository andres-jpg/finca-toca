"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface PageErrorProps {
  message?: string;
  onReset: () => void;
}

export function PageError({
  message = "Ocurrió un problema al obtener la información.",
  onReset,
}: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <h2 className="text-base font-semibold">Error al cargar los datos</h2>
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      <Button onClick={onReset} variant="outline" size="sm">
        Reintentar
      </Button>
    </div>
  );
}
