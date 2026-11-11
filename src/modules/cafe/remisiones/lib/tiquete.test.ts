import { describe, expect, it } from "vitest";
import type { DetalleServicio, Remision } from "../types";
import { bloqueServicio, bloquesServicios, lineaCliente, resumenEntrega, valorReferencia } from "./tiquete";

// El ejemplo del informe y de la tarea FIN-113: 500 kg, 8 bultos, trilla + tostión + molienda (+ empaque incluido).
const base = { tarifaKg: null, nivelTueste: null, incluido: false, pendiente: false } as const;
const trilla: DetalleServicio = { ...base, servicio: "trilla", kgEntrada: 500, kgSalida: 405, mermaKg: 95, tarifaKg: 1400, valor: 700000 };
const tostion: DetalleServicio = { ...base, servicio: "tostion", kgEntrada: 405, kgSalida: 332, mermaKg: 73, tarifaKg: 2200, valor: 891000, nivelTueste: "medio" };
const molienda: DetalleServicio = { ...base, servicio: "molienda", kgEntrada: 332, kgSalida: 330, mermaKg: 2, tarifaKg: 1000, valor: 332000 };
const empaque: DetalleServicio = { ...base, servicio: "empaque", kgEntrada: 330, kgSalida: 330, mermaKg: 0, tarifaKg: 0, valor: 0, incluido: true };

describe("bloqueServicio", () => {
  it("trilla: kg entra → sale y merma de trilla (calculada desde los kilos)", () => {
    expect(bloqueServicio(trilla)).toEqual({
      titulo: "Trilla",
      lineas: [
        { etiqueta: "Entra → sale", valor: "500,0 → 405,0 kg" },
        { etiqueta: "Merma de trilla", valor: "19,0 %" },
      ],
    });
  });

  it("trilla con humedad y densidad (B-04): las dos líneas al final", () => {
    expect(bloqueServicio({ ...trilla, kgEntrada: 250, kgSalida: 202.5, mermaKg: 47.5, humedadPct: 11.2, densidadGl: 720 }).lineas).toEqual([
      { etiqueta: "Entra → sale", valor: "250,0 → 202,5 kg" },
      { etiqueta: "Merma de trilla", valor: "19,0 %" },
      { etiqueta: "Humedad", valor: "11,2 %" },
      { etiqueta: "Densidad", valor: "720,0 g/L" },
    ]);
  });

  it("tostión: perfil de tueste, kg entra → sale y merma de tostión", () => {
    expect(bloqueServicio(tostion, "Medio · 222 °C · 17 min")).toEqual({
      titulo: "Tostión",
      lineas: [
        { etiqueta: "Perfil de tueste", valor: "Medio · 222 °C · 17 min" },
        { etiqueta: "Entra → sale", valor: "405,0 → 332,0 kg" },
        { etiqueta: "Merma de tostión", valor: "18,0 %" },
      ],
    });
  });

  it("B-17: 27,0 kg tostados → 22,1 kg imprime merma de tostión 18,1 % y entregado 22,1 kg", () => {
    const t: DetalleServicio = { ...tostion, kgEntrada: 27, kgSalida: 22.1, mermaKg: 4.9 };
    const b = bloqueServicio(t);
    expect(b.lineas).toContainEqual({ etiqueta: "Entra → sale", valor: "27,0 → 22,1 kg" });
    expect(b.lineas).toContainEqual({ etiqueta: "Merma de tostión", valor: "18,1 %" });
    expect(resumenEntrega({ pesoRecibidoKg: 40, pesoEntregadoKg: 22.1, mermaTotalKg: 17.9 }).entregado).toBe("22,1 kg");
  });

  it("molienda: kg molidos y valor, SIN merma", () => {
    const b = bloqueServicio({ ...molienda, kgSalida: 20, valor: 20000 });
    expect(b).toEqual({ titulo: "Molienda", lineas: [{ etiqueta: "Molido", valor: "20,0 kg · $20.000" }] });
    expect(JSON.stringify(b)).not.toMatch(/merma/i);
  });

  it("empaque de maquila: solo «Incluido», sin merma", () => {
    const b = bloqueServicio(empaque);
    expect(b).toEqual({ titulo: "Empaque", lineas: [{ etiqueta: "Costo", valor: "Incluido" }] });
  });

  it("un servicio pendiente (entrega forzada) sale sin cifras, nunca con ceros", () => {
    const pendiente: DetalleServicio = { ...base, servicio: "molienda", kgEntrada: null, kgSalida: null, mermaKg: null, valor: null, pendiente: true };
    expect(bloqueServicio(pendiente)).toEqual({ titulo: "Molienda", lineas: [{ etiqueta: "Estado", valor: "Pendiente" }] });
  });

  it("miles con punto: 1.234,5", () => {
    expect(bloqueServicio({ ...trilla, kgEntrada: 1234.5, kgSalida: 1000, mermaKg: 234.5 }).lineas[0].valor).toBe("1.234,5 → 1.000,0 kg");
  });

  it("ningún bloque del tiquete menciona merma de molienda o de empaque", () => {
    const texto = JSON.stringify(bloquesServicios([trilla, tostion, molienda, empaque], "Medio"));
    expect(texto).not.toMatch(/merma de (molienda|empaque)/i);
    expect(texto).not.toMatch(/bulto/i);
  });
});

describe("bloquesServicios", () => {
  it("conserva el orden recibido", () => {
    expect(bloquesServicios([trilla, tostion, molienda, empaque]).map((b) => b.titulo)).toEqual(["Trilla", "Tostión", "Molienda", "Empaque"]);
  });
});

describe("resumenEntrega", () => {
  it("ejemplo: recibido 500, entregado 330, merma 170 kg (34 %)", () => {
    expect(resumenEntrega({ pesoRecibidoKg: 500, pesoEntregadoKg: 330, mermaTotalKg: 170 })).toEqual({
      recibido: "500,0 kg",
      entregado: "330,0 kg",
      mermaKg: "170,0 kg",
      mermaPct: "34,0 %",
    });
  });

  it("merma con decimales: 172 de 500 kg = 34,4 %", () => {
    expect(resumenEntrega({ pesoRecibidoKg: 500, pesoEntregadoKg: 328, mermaTotalKg: 172 }).mermaPct).toBe("34,4 %");
  });

  it("sin merma: 0 %", () => {
    expect(resumenEntrega({ pesoRecibidoKg: 100, pesoEntregadoKg: 100, mermaTotalKg: 0 }).mermaPct).toBe("0,0 %");
  });
});

describe("textos sueltos", () => {
  it("valor de referencia en pesos, sin Intl", () => {
    expect(valorReferencia(1923000)).toBe("$1.923.000");
    expect(valorReferencia(0)).toBe("$0");
  });

  it("cliente con y sin identificación", () => {
    const r: Pick<Remision, "clienteNombre" | "clienteIdentificacion"> = { clienteNombre: "Juan Pérez", clienteIdentificacion: "1234567" };
    expect(lineaCliente(r)).toBe("Juan Pérez · 1234567");
    expect(lineaCliente({ ...r, clienteIdentificacion: null })).toBe("Juan Pérez");
  });
});
