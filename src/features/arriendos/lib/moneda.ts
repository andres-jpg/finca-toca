/** Formato de pesos usado en todo el módulo: `$1.250.000`, sin decimales. */
export function formatMoneda(valor: number): string {
  const signo = valor < 0 ? "−" : "";
  return `${signo}$${Math.abs(valor).toLocaleString("es-CO", { minimumFractionDigits: 0 })}`;
}
