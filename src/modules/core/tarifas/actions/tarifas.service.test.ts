import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/lib/auth/errors";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const guards = vi.hoisted(() => ({ requireRolTenant: vi.fn(), requireModulo: vi.fn() }));
vi.mock("../../auth/guards", () => ({ requireRolTenant: guards.requireRolTenant }));
vi.mock("../../tenants/tenant.guards", () => ({ requireModulo: guards.requireModulo }));
const db = vi.hoisted(() => ({ single: vi.fn(), insert: vi.fn(), select: vi.fn(), eq: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      insert: db.insert.mockReturnValue({ select: () => ({ single: db.single }) }),
      delete: db.delete.mockReturnValue({ eq: db.eq.mockReturnValue({ select: db.select }) }),
    }),
  })),
}));

import { defineConceptosTarifa, limpiarConceptosTarifa } from "../registry";
import { crearTarifa, eliminarTarifaProgramada } from "./tarifas.service";

describe("crearTarifa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.requireRolTenant.mockResolvedValue({});
    guards.requireModulo.mockResolvedValue(undefined);
    limpiarConceptosTarifa();
    defineConceptosTarifa([{ concepto: "cafe.trilla", modulo: "cafe.procesos", etiqueta: "Trilla", unidad: "kg" }]);
    db.single.mockResolvedValue({ data: { id: "t1" }, error: null });
  });

  it("exige owner/admin: un operativo no llega a escribir", async () => {
    guards.requireRolTenant.mockRejectedValue(new AuthorizationError());
    await expect(crearTarifa({ concepto: "cafe.trilla", valor: 1400 })).rejects.toBeInstanceOf(AuthorizationError);
    expect(db.insert).not.toHaveBeenCalled();
    expect(guards.requireRolTenant).toHaveBeenCalledWith(["owner", "admin"]);
  });

  it("exige el módulo dueño del concepto", async () => {
    guards.requireModulo.mockRejectedValue(new AuthorizationError());
    await expect(crearTarifa({ concepto: "cafe.trilla", valor: 1400 })).rejects.toBeInstanceOf(AuthorizationError);
    expect(guards.requireModulo).toHaveBeenCalledWith("cafe.procesos");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rechaza un concepto que ningún módulo declara", async () => {
    const r = await crearTarifa({ concepto: "cafe.empaque", valor: 100 });
    expect(r).toMatchObject({ ok: false, code: "datos_invalidos" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rechaza una vigencia en el pasado: una tarifa nueva solo afecta a lo que venga después", async () => {
    const ayer = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const r = await crearTarifa({ concepto: "cafe.trilla", valor: 1400, vigenteDesde: ayer });
    expect(r).toMatchObject({ ok: false, code: "datos_invalidos" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserta con la unidad de la definición; sin vigencia deja que rija desde now() de la base", async () => {
    const r = await crearTarifa({ concepto: "cafe.trilla", valor: 1400 });
    expect(r).toEqual({ ok: true, data: { id: "t1" } });
    expect(db.insert).toHaveBeenCalledWith({ concepto: "cafe.trilla", valor: 1400, unidad: "kg", observaciones: null });
  });

  it("acepta una vigencia futura (tarifa programada)", async () => {
    const manana = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await crearTarifa({ concepto: "cafe.trilla", valor: 1500, vigenteDesde: manana });
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ vigente_desde: manana }));
  });

  it("23505 (mismo instante de vigencia) → duplicado con mensaje claro", async () => {
    db.single.mockResolvedValue({ data: null, error: { code: "23505", message: "x" } });
    const r = await crearTarifa({ concepto: "cafe.trilla", valor: 1400 });
    expect(r).toMatchObject({ ok: false, code: "duplicado" });
  });

  it("42501 (RLS) → no_autorizado", async () => {
    db.single.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } });
    const r = await crearTarifa({ concepto: "cafe.trilla", valor: 1400 });
    expect(r).toMatchObject({ ok: false, code: "no_autorizado" });
  });
});

describe("eliminarTarifaProgramada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guards.requireRolTenant.mockResolvedValue({});
  });

  it("borra una tarifa programada", async () => {
    db.select.mockResolvedValue({ data: [{ id: "6f1b6e0a-8a4e-4f2a-9a58-0c2f3c7a9b11" }], error: null });
    const r = await eliminarTarifaProgramada("6f1b6e0a-8a4e-4f2a-9a58-0c2f3c7a9b11");
    expect(r).toEqual({ ok: true, data: { id: "6f1b6e0a-8a4e-4f2a-9a58-0c2f3c7a9b11" } });
  });

  it("si el RLS no deja borrar (ya vigente o ajena) devuelve tarifa_no_eliminable", async () => {
    db.select.mockResolvedValue({ data: [], error: null });
    const r = await eliminarTarifaProgramada("6f1b6e0a-8a4e-4f2a-9a58-0c2f3c7a9b11");
    expect(r).toMatchObject({ ok: false, code: "tarifa_no_eliminable" });
  });

  it("un id que no es uuid ni llega a la base", async () => {
    const r = await eliminarTarifaProgramada("no-es-uuid");
    expect(r).toMatchObject({ ok: false, code: "datos_invalidos" });
    expect(db.delete).not.toHaveBeenCalled();
  });
});
