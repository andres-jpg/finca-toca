import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Tarjeta común de los gráficos del panel: título, subtítulo y un mensaje cuando no hay nada que pintar. */
export function MarcoGrafico({
  titulo,
  subtitulo,
  vacio,
  textoVacio,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  vacio: boolean;
  textoVacio: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-semibold text-gray-700">{titulo}</CardTitle>
        {subtitulo && <p className="text-xs text-gray-500">{subtitulo}</p>}
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        {vacio ? <div className="flex h-48 items-center justify-center text-sm text-gray-400">{textoVacio}</div> : children}
      </CardContent>
    </Card>
  );
}
