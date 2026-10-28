import { beforeEach, describe, expect, it, vi } from "vitest";
import { autorizarExport } from "@/modules/core/export/registry";
import type { Sesion } from "@/modules/core/auth/sesion";
import { exportadorLotes } from "./exportador";
import type { LoteExport, ProcesoExport } from "./lib/exportar";

const { leerLotesExport, leerProcesosExport } = vi.hoisted(() => ({ leerLotesExport: vi.fn(), leerProcesosExport: vi.fn() }));
vi.mock("./queries/exportar.queries", () => ({ leerLotesExport, leerProcesosExport }));

const lote = (codigo: string): LoteExport => ({
  id: codigo,
  codigo,
  linea: "servicio",
  servicios: ["tostion", "empaque"],
  tercero: "Cafés del Norte",
  identificacion: "800555111",
  tipoCafe: null,
  fechaRecepcion: "2026-11-02",
  numBultos: 4,
  pesoRecibidoKg: 100,
  humedadPct: null,
  densidad: null,
  alertasCalidad: [],
  nivelTueste: "medio",
  precioCompraKg: null,
  valorCompra: null,
  pesoActualKg: 82,
  mermaTotalKg: 18,
  valorServicios: 220_000,
  estado: "parcial",
  avanceTexto: "1 de 2",
  remision: null,
});

const proceso = (loteCodigo: string, fecha: string): ProcesoExport => ({
  loteCodigo,
  linea: "servicio",
  fecha,
  tipo: "tostion",
  numBultos: 4,
  pesoEntradaKg: 100,
  pesoSalidaKg: 82,
  mermaKg: 18,
  mermaReferenciaPct: 18,
  desvio: false,
  nivelTueste: "medio",
  tarifaKg: 2200,
  valor: 220_000,
  registradoPor: null,
  creadoEn: `${fecha}T15:00:00Z`,
  anulado: false,
  motivoAnulacion: null,
});

const sesion = (rolTenant: Sesion["rolTenant"], modulos: string[]) =>
  ({ rolTenant, rolLegacy: null, tenant: { modulos } }) as unknown as Parameters<typeof autorizarExport>[0];

describe("exportadorLotes", () => {
  beforeEach(() => {
    leerLotesExport.mockReset();
    leerProcesosExport.mockReset();
  });

  it("es el recurso cafe-lotes, ligado a cafe.recepcion y abierto a los cuatro roles", () => {
    expect(exportadorLotes.recurso).toBe("cafe-lotes");
    expect(exportadorLotes.modulo).toBe("cafe.recepcion");
    expect([...exportadorLotes.roles].sort()).toEqual(["admin", "operativo", "owner", "viewer"]);
  });

  it("Gerencia (viewer) puede exportar; sin el módulo o sin sesión no", () => {
    expect(autorizarExport(sesion("viewer", ["cafe.recepcion"]), exportadorLotes)).toBe("ok");
    expect(autorizarExport(sesion("operativo", ["cafe.recepcion"]), exportadorLotes)).toBe("ok");
    expect(autorizarExport(sesion("viewer", ["core.terceros"]), exportadorLotes)).toBe("sin_modulo");
    expect(autorizarExport(null, exportadorLotes)).toBe("sin_sesion");
  });

  it("lee los filtros de la URL con la misma lectura del listado y los pasa a las dos consultas", async () => {
    const lotes = [lote("MQ-2026-0002"), lote("MQ-2026-0001")];
    leerLotesExport.mockResolvedValue(lotes);
    leerProcesosExport.mockResolvedValue([proceso("MQ-2026-0001", "2026-11-05"), proceso("MQ-2026-0002", "2026-11-04")]);

    const r = await exportadorLotes.generar({
      sesion: {} as Sesion,
      // `pagina` y un tipo inválido no cuentan: el listado los trataría igual.
      filtros: new URLSearchParams("tipo=maquila&estado=parcial&desde=2026-11-01&hasta=2026-11-30&pagina=3&basura=1"),
    });

    const filtros = leerLotesExport.mock.calls[0][0];
    expect(filtros).toMatchObject({ tipo: "maquila", estado: "parcial", desde: "2026-11-01", hasta: "2026-11-30" });
    expect(leerProcesosExport).toHaveBeenCalledWith(lotes, filtros);

    expect(r.desde).toBe("2026-11-01");
    expect(r.hasta).toBe("2026-11-30");
    expect(r.hojas.map((h) => h.nombre)).toEqual(["Lotes", "Procesos"]);
    expect(r.hojas[0].subtitulo).toBe("Tipo: Maquila · Estado: Parcial · 01/11/2026–30/11/2026");
    expect(r.hojas[0].filas.map((l: LoteExport) => l.codigo)).toEqual(["MQ-2026-0002", "MQ-2026-0001"]);
    // Procesos en el orden de la hoja Lotes, no por fecha global.
    expect(r.hojas[1].filas.map((p: ProcesoExport) => p.loteCodigo)).toEqual(["MQ-2026-0002", "MQ-2026-0001"]);
  });

  it("sin filtros: «Sin filtros», sin rango en el nombre del archivo", async () => {
    leerLotesExport.mockResolvedValue([]);
    leerProcesosExport.mockResolvedValue([]);
    const r = await exportadorLotes.generar({ sesion: {} as Sesion, filtros: new URLSearchParams() });
    expect(r.hojas[0].subtitulo).toBe("Sin filtros");
    expect(r.desde).toBeNull();
    expect(r.hasta).toBeNull();
  });
});
