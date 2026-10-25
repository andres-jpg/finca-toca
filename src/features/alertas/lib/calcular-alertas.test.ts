import { describe, expect, it } from "vitest";
import type { Alerta } from "@/types";
import {
  calcularAlertas,
  dentroDelHorizonte,
  faltaRegistrarServicio,
  type AnimalParaAlertas,
  type EventoParaAlertas,
} from "./calcular-alertas";

// Fecha fija (hora local, como `parseFechaDB`): 15 de junio de 2026.
const HOY = new Date(2026, 5, 15);

function hembra(sobrescribir: Partial<AnimalParaAlertas> = {}): AnimalParaAlertas {
  return {
    id: "a1",
    nombre: "Luna",
    identificador: "101",
    sexo: "hembra",
    origen: "finca",
    fecha_nacimiento: null,
    estado_productivo: "produccion",
    estado_reproductivo: "cargada",
    ...sobrescribir,
  };
}

function evento(
  tipo_evento: EventoParaAlertas["tipo_evento"],
  fecha: string,
  sobrescribir: Partial<EventoParaAlertas> = {}
): EventoParaAlertas {
  return { animal_id: "a1", tipo_evento, fecha, resultado: null, ...sobrescribir };
}

const deTipo = (alertas: Alerta[], tipo: Alerta["tipo"]) => alertas.filter((a) => a.tipo === tipo);

describe("calcularAlertas · secado y parto probable", () => {
  const servicio = evento("inseminacion", "2026-01-10");

  it("cuenta secado (+7 meses) y parto (+9 meses) desde la fecha de la inseminación", () => {
    const alertas = calcularAlertas([hembra()], [servicio], HOY);

    const secado = deTipo(alertas, "secado");
    const parto = deTipo(alertas, "parto");
    expect(secado).toHaveLength(1);
    expect(parto).toHaveLength(1);
    expect(secado[0]).toMatchObject({
      id: "a1:secado",
      fecha_objetivo: "2026-08-10",
      dias_restantes: 56,
      severidad: "proxima",
      resoluble: true,
      detalle: "Inseminación del 10/01/2026",
    });
    expect(parto[0]).toMatchObject({
      fecha_objetivo: "2026-10-10",
      dias_restantes: 117,
      resoluble: false,
    });
  });

  it("una monta se etiqueta como Monta y cuenta igual que una inseminación", () => {
    const alertas = calcularAlertas([hembra()], [evento("monta", "2026-01-10")], HOY);

    expect(deTipo(alertas, "parto")[0].detalle).toBe("Monta del 10/01/2026");
  });

  it("toma el servicio más reciente, no el primero", () => {
    const alertas = calcularAlertas(
      [hembra()],
      [evento("inseminacion", "2025-11-01"), evento("monta", "2026-01-10")],
      HOY
    );

    expect(deTipo(alertas, "parto")[0].fecha_objetivo).toBe("2026-10-10");
  });

  it("sin evento de servicio no hay alertas aunque la vaca esté cargada", () => {
    expect(calcularAlertas([hembra()], [], HOY)).toEqual([]);
  });

  it("solo aparecen con la vaca en cargada", () => {
    const alertas = calcularAlertas(
      [hembra({ estado_reproductivo: "por_confirmar" })],
      [servicio],
      HOY
    );

    expect(deTipo(alertas, "secado")).toHaveLength(0);
    expect(deTipo(alertas, "parto")).toHaveLength(0);
  });

  it("el secado no se avisa si la vaca ya está secada o aún no está en producción", () => {
    for (const estado of ["secado", "levante_2"] as const) {
      const alertas = calcularAlertas([hembra({ estado_productivo: estado })], [servicio], HOY);
      expect(deTipo(alertas, "secado")).toHaveLength(0);
      expect(deTipo(alertas, "parto")).toHaveLength(1);
    }
  });

  it("un evento secado posterior al servicio cierra la alerta de secado", () => {
    const alertas = calcularAlertas([hembra()], [servicio, evento("secado", "2026-05-01")], HOY);

    expect(deTipo(alertas, "secado")).toHaveLength(0);
    expect(deTipo(alertas, "parto")).toHaveLength(1);
  });

  it("un secado anterior al servicio no cierra la alerta", () => {
    const alertas = calcularAlertas([hembra()], [evento("secado", "2025-12-01"), servicio], HOY);

    expect(deTipo(alertas, "secado")).toHaveLength(1);
  });

  it("un parto posterior al servicio cierra la alerta de parto", () => {
    const alertas = calcularAlertas([hembra()], [servicio, evento("parto", "2026-06-01")], HOY);

    expect(deTipo(alertas, "parto")).toHaveLength(0);
  });

  it("marca como vencida (días negativos) una fecha objetivo ya pasada", () => {
    const alertas = calcularAlertas([hembra()], [evento("inseminacion", "2025-10-01")], HOY);

    // 01/10/2025 + 7 meses = 01/05/2026, 45 días antes de HOY.
    expect(deTipo(alertas, "secado")[0]).toMatchObject({
      fecha_objetivo: "2026-05-01",
      dias_restantes: -45,
      severidad: "vencida",
    });
  });

  it("severidad 'hoy' cuando la fecha objetivo es el día de hoy", () => {
    const alertas = calcularAlertas([hembra()], [evento("inseminacion", "2025-11-15")], HOY);

    expect(deTipo(alertas, "secado")[0]).toMatchObject({ dias_restantes: 0, severidad: "hoy" });
  });
});

describe("calcularAlertas · celo", () => {
  it("tras un parto, avisa a los 60 días mientras la vaca esté en pre_servicio", () => {
    const alertas = calcularAlertas(
      [hembra({ estado_reproductivo: "pre_servicio" })],
      [evento("parto", "2026-04-20")],
      HOY
    );

    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      tipo: "celo",
      fecha_objetivo: "2026-06-19",
      dias_restantes: 4,
      detalle: "Parto del 20/04/2026",
    });
  });

  it("tras un aborto cuenta igual pero lo etiqueta como Aborto", () => {
    const alertas = calcularAlertas(
      [hembra({ estado_reproductivo: "pre_servicio" })],
      [evento("aborto", "2026-04-20")],
      HOY
    );

    expect(alertas[0].detalle).toBe("Aborto del 20/04/2026");
  });

  it("sigue viva (vencida) cuando el cron ya pasó la vaca a servicio", () => {
    const alertas = calcularAlertas(
      [hembra({ estado_reproductivo: "servicio" })],
      [evento("parto", "2026-04-10")],
      HOY
    );

    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ fecha_objetivo: "2026-06-09", severidad: "vencida" });
  });

  it("se resuelve al registrar un celo o un servicio posterior al parto", () => {
    for (const cierre of [evento("celo", "2026-05-25"), evento("inseminacion", "2026-06-01")]) {
      const alertas = calcularAlertas(
        [hembra({ estado_reproductivo: "pre_servicio" })],
        [evento("parto", "2026-04-20"), cierre],
        HOY
      );
      expect(alertas).toEqual([]);
    }
  });

  it("en servicio sin parto, repite cada 20 días desde el último evento reproductivo", () => {
    const alertas = calcularAlertas(
      [hembra({ estado_reproductivo: "servicio" })],
      [evento("celo", "2026-05-01")],
      HOY
    );

    // 45 días transcurridos → 3 ciclos de 20 días → 01/05 + 60 días.
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      tipo: "celo",
      fecha_objetivo: "2026-06-30",
      dias_restantes: 15,
      detalle: "En servicio desde el 01/05/2026",
    });
  });

  it("el celo cíclico nunca cae en el pasado: mínimo un ciclo desde la base", () => {
    const alertas = calcularAlertas(
      [hembra({ estado_reproductivo: "servicio" })],
      [evento("celo", "2026-06-15")],
      HOY
    );

    expect(alertas[0]).toMatchObject({ fecha_objetivo: "2026-07-05", dias_restantes: 20 });
  });

  it("en servicio sin ningún evento reproductivo no hay alerta (sin fecha base)", () => {
    const alertas = calcularAlertas([hembra({ estado_reproductivo: "servicio" })], [], HOY);

    expect(alertas).toEqual([]);
  });

  it("los machos no generan alertas de celo ni de gestación", () => {
    const macho = hembra({ sexo: "macho", estado_reproductivo: null });

    expect(calcularAlertas([macho], [evento("inseminacion", "2026-01-10")], HOY)).toEqual([]);
  });
});

describe("calcularAlertas · topizado", () => {
  const cria = hembra({
    fecha_nacimiento: "2026-06-10",
    estado_productivo: "leche",
    estado_reproductivo: "pre_puber",
  });

  it("avisa a los 15 días del nacimiento y es resoluble", () => {
    const alertas = calcularAlertas([cria], [], HOY);

    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      tipo: "topizado",
      fecha_objetivo: "2026-06-25",
      dias_restantes: 10,
      resoluble: true,
      detalle: "Nacida el 10/06/2026",
    });
  });

  it("se cierra con el evento topizado", () => {
    expect(calcularAlertas([cria], [evento("topizado", "2026-06-12")], HOY)).toEqual([]);
  });

  it("no aplica a animales comprados ni a los que ya salieron de la leche", () => {
    expect(calcularAlertas([{ ...cria, origen: "externa" }], [], HOY)).toEqual([]);
    expect(calcularAlertas([{ ...cria, estado_productivo: "levante_1" }], [], HOY)).toEqual([]);
  });
});

describe("calcularAlertas · revacunación", () => {
  function vacuna(fechaRevacunacion: string, extra: Partial<EventoParaAlertas> = {}) {
    return evento("vacunacion", "2026-01-01", {
      requiere_revacunacion: true,
      periodo_revacunacion: "6_meses",
      fecha_revacunacion: fechaRevacunacion,
      ...extra,
    });
  }

  it("se emite justo en el borde de la ventana: 8 días antes", () => {
    const alertas = calcularAlertas([hembra()], [vacuna("2026-06-23")], HOY);

    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      tipo: "revacunacion",
      dias_restantes: 8,
      severidad: "proxima",
      resoluble: false,
      detalle: "Vacunación del 01/01/2026 · revacunar a los 6 meses",
    });
  });

  it("no se emite con 9 días o más de antelación", () => {
    expect(calcularAlertas([hembra()], [vacuna("2026-06-24")], HOY)).toEqual([]);
  });

  it("sigue viva y vencida cuando la fecha ya pasó", () => {
    const alertas = calcularAlertas([hembra()], [vacuna("2026-06-01")], HOY);

    expect(alertas[0]).toMatchObject({ dias_restantes: -14, severidad: "vencida" });
  });

  it("no se emite si la vacunación no requiere revacunación o no tiene fecha", () => {
    expect(
      calcularAlertas([hembra()], [vacuna("2026-06-20", { requiere_revacunacion: false })], HOY)
    ).toEqual([]);
    expect(
      calcularAlertas([hembra()], [vacuna("2026-06-20", { fecha_revacunacion: null })], HOY)
    ).toEqual([]);
  });

  it("solo manda la última vacunación del animal", () => {
    const anterior = vacuna("2026-06-20", { fecha: "2026-01-01" });
    const siguienteSinRevacunar = evento("vacunacion", "2026-06-10", {
      requiere_revacunacion: false,
    });

    expect(calcularAlertas([hembra()], [anterior, siguienteSinRevacunar], HOY)).toEqual([]);
  });

  it("aplica también a los machos", () => {
    const toro = hembra({ sexo: "macho", estado_reproductivo: null, estado_productivo: "reproductor" });

    expect(calcularAlertas([toro], [vacuna("2026-06-20")], HOY)).toHaveLength(1);
  });

  it("sin periodo guardado omite el sufijo del detalle", () => {
    const alertas = calcularAlertas(
      [hembra()],
      [vacuna("2026-06-20", { periodo_revacunacion: null })],
      HOY
    );

    expect(alertas[0].detalle).toBe("Vacunación del 01/01/2026");
  });
});

describe("calcularAlertas · orden y agrupación", () => {
  it("ordena por fecha objetivo y desempata por identificador numérico", () => {
    const a = hembra({ id: "a1", identificador: "10", estado_reproductivo: "servicio" });
    const b = hembra({ id: "a2", identificador: "9", estado_reproductivo: "servicio" });
    const eventos = [
      evento("celo", "2026-05-01", { animal_id: "a1" }),
      evento("celo", "2026-05-01", { animal_id: "a2" }),
    ];

    const alertas = calcularAlertas([a, b], eventos, HOY);

    expect(alertas.map((x) => x.animal_identificador)).toEqual(["9", "10"]);
  });

  it("no mezcla los eventos de un animal con los de otro", () => {
    const a = hembra({ id: "a1" });
    const b = hembra({ id: "a2", identificador: "102" });

    const alertas = calcularAlertas([a, b], [evento("inseminacion", "2026-01-10")], HOY);

    expect(new Set(alertas.map((x) => x.animal_id))).toEqual(new Set(["a1"]));
  });
});

describe("dentroDelHorizonte", () => {
  const alerta = (tipo: Alerta["tipo"], dias_restantes: number): Alerta => ({
    id: `x:${tipo}`,
    tipo,
    animal_id: "x",
    animal_nombre: "X",
    animal_identificador: "1",
    fecha_objetivo: "2026-06-23",
    dias_restantes,
    severidad: "proxima",
    resoluble: false,
    detalle: "",
  });

  it("el resto de tipos se recortan al horizonte del consumidor", () => {
    expect(dentroDelHorizonte(alerta("secado", 7), 7)).toBe(true);
    expect(dentroDelHorizonte(alerta("secado", 8), 7)).toBe(false);
  });

  it("la revacunación usa su propia ventana de 8 días", () => {
    expect(dentroDelHorizonte(alerta("revacunacion", 8), 7)).toBe(true);
    expect(dentroDelHorizonte(alerta("revacunacion", 9), 7)).toBe(false);
  });

  it("las vencidas siempre quedan dentro", () => {
    expect(dentroDelHorizonte(alerta("parto", -30), 7)).toBe(true);
  });
});

describe("faltaRegistrarServicio", () => {
  it("true para una hembra cargada sin inseminación ni monta", () => {
    expect(faltaRegistrarServicio(hembra(), [])).toBe(true);
    expect(faltaRegistrarServicio(hembra(), [evento("palpacion", "2026-03-01")])).toBe(true);
  });

  it("false si hay servicio registrado, no está cargada o es macho", () => {
    expect(faltaRegistrarServicio(hembra(), [evento("monta", "2026-01-10")])).toBe(false);
    expect(faltaRegistrarServicio(hembra({ estado_reproductivo: "servicio" }), [])).toBe(false);
    expect(faltaRegistrarServicio(hembra({ sexo: "macho" }), [])).toBe(false);
  });
});
