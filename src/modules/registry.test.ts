import { describe, expect, it } from "vitest";
import type { RolLegacy, RolTenant } from "@/modules/core/auth/sesion";
import { MODULOS, type ModuloId } from "@/modules/core/tenants/modulos";
import type { Vertical } from "@/modules/core/tenants/tenant.queries";
import { ocultoEnPWA, type SesionNav } from "@/modules/core/registry/nav";
import { ICONOS_NAV } from "@/modules/core/registry/iconos";
import { getExportador } from "@/modules/core/export/registry";
import { MANIFIESTOS, getNavParaSesion } from "./registry";
import { MENU_BASELINE } from "./registry.baseline";

const BASE_GANADERIA: ModuloId[] = [
  "ganaderia.animales",
  "ganaderia.extracciones",
  "ganaderia.finanzas",
  "ganaderia.inventario",
];
const MODULOS_COOPERATIVA: ModuloId[] = [
  "cooperativa.rutas",
  "cooperativa.recolecciones",
  "cooperativa.pagos",
  "cooperativa.informes",
];

/** Sesión simulada. El rol de la membresía sale del mismo mapeo que el backfill (`roles` → `tenant_members`). */
function sesion(
  vertical: Vertical,
  modulos: string[],
  rolLegacy: RolLegacy | null,
  rolTenant?: RolTenant | null
): SesionNav {
  const equivalente: Record<RolLegacy, RolTenant> = {
    admin: "admin",
    user: "operativo",
    viewer: "viewer",
    cooperativa_admin: "admin",
    cooperativa_user: "operativo",
  };
  return {
    tenant: { vertical, modulos },
    rolLegacy,
    rolTenant: rolTenant !== undefined ? rolTenant : rolLegacy ? equivalente[rolLegacy] : null,
  };
}

const hrefs = (s: SesionNav, pwa = false) => getNavParaSesion(s, { pwa }).map((i) => i.href);
const resumen = (s: SesionNav, pwa = false) =>
  getNavParaSesion(s, { pwa }).map(({ href, label, icon }) => ({ href, label, icon }));

describe("getNavParaSesion: el menú de cada usuario es idéntico al anterior a FIN-92", () => {
  const VB = [...BASE_GANADERIA, "ganaderia.arriendos"];
  const casos: [string, SesionNav, boolean][] = [
    ["admin@vb.test", sesion("ganaderia", VB, "admin"), false],
    ["user@vb.test", sesion("ganaderia", VB, "user"), false],
    ["viewer@vb.test", sesion("ganaderia", VB, "viewer"), false],
    ["admin@velero.test", sesion("ganaderia", BASE_GANADERIA, "admin"), false],
    ["coop.admin@test|web", sesion("cooperativa", MODULOS_COOPERATIVA, "cooperativa_admin"), false],
    ["coop.admin@test|pwa", sesion("cooperativa", MODULOS_COOPERATIVA, "cooperativa_admin"), true],
    ["coop.user@test|web", sesion("cooperativa", MODULOS_COOPERATIVA, "cooperativa_user"), false],
    ["coop.user@test|pwa", sesion("cooperativa", MODULOS_COOPERATIVA, "cooperativa_user"), true],
  ];

  it.each(casos)("%s", (clave, s, pwa) => {
    expect(resumen(s, pwa)).toEqual(MENU_BASELINE[clave]);
  });

  it("cubre todas las combinaciones de la línea base", () => {
    expect(casos.map(([clave]) => clave).sort()).toEqual(Object.keys(MENU_BASELINE).sort());
  });
});

describe("getNavParaSesion: módulos y verticales", () => {
  it("activar un módulo en tenant_modulos hace aparecer su entrada, en su sitio, sin tocar código", () => {
    const sin = sesion("ganaderia", BASE_GANADERIA, "admin");
    const con = sesion("ganaderia", [...BASE_GANADERIA, "ganaderia.arriendos"], "admin");
    expect(hrefs(sin)).not.toContain("/dashboard/arriendos");
    const h = hrefs(con);
    expect(h).toContain("/dashboard/arriendos");
    expect(h.indexOf("/dashboard/arriendos")).toBe(h.indexOf("/dashboard/inventario") + 1);
  });

  it("un cliente al que se le quita un módulo pierde sus entradas", () => {
    const s = sesion("ganaderia", ["ganaderia.animales"], "admin");
    expect(hrefs(s)).toEqual(["/dashboard/animales", "/dashboard/informe-avanzado"]);
  });

  it("las entradas de otro vertical no salen aunque el rol y los módulos coincidan", () => {
    const s = sesion("ganaderia", [...BASE_GANADERIA, ...MODULOS_COOPERATIVA], "cooperativa_admin");
    expect(hrefs(s)).toEqual([]);
    const c = sesion("cooperativa", [...MODULOS_COOPERATIVA, ...BASE_GANADERIA], "admin");
    expect(hrefs(c)).toEqual([]);
  });

  it("sin rol legacy (p. ej. platform admin) no hay entradas de pantallas legacy", () => {
    expect(hrefs(sesion("ganaderia", BASE_GANADERIA, null, "owner"))).toEqual([]);
  });

  it("sin módulos activos no hay menú", () => {
    expect(hrefs(sesion("ganaderia", [], "admin"))).toEqual([]);
  });

  it("café solo muestra las entradas de los módulos que tiene", () => {
    expect(hrefs(sesion("cafe", ["cafe.procesos"], null, "owner"))).toEqual(["/dashboard/cafe/planta"]);
    // Insumos ya no es entrada de menú: es una pestaña de Configuración (A-07).
    expect(hrefs(sesion("cafe", ["cafe.inventario"], null, "owner"))).toEqual(["/dashboard/cafe/inventario"]);
    expect(hrefs(sesion("cafe", ["cafe.remisiones"], null, "viewer"))).toEqual(["/dashboard/cafe/remisiones"]);
    // Ventas (CO-31): cualquier rol la ve (Gerencia solo consulta); va en el recorrido, antes de «Consultar».
    expect(hrefs(sesion("cafe", ["cafe.ventas"], null, "viewer"))).toEqual(["/dashboard/cafe/ventas/nueva"]);
    expect(hrefs(sesion("cafe", ["cafe.ventas", "cafe.remisiones"], null, "operativo"))).toEqual([
      "/dashboard/cafe/ventas/nueva",
      "/dashboard/cafe/remisiones",
    ]);
    expect(hrefs(sesion("cafe", ["cafe.recepcion"], null, "owner"))).toEqual([
      "/dashboard/cafe/recibir",
      "/dashboard/cafe/lotes",
      "/dashboard/cafe/configuracion",
    ]);
  });
});

describe("getNavParaSesion: entradas del núcleo (core.terceros)", () => {
  const modulos = [...BASE_GANADERIA, "core.terceros"];

  it("hoy ningún cliente tiene core.terceros: no aparecen Terceros ni Tarifas", () => {
    expect(hrefs(sesion("ganaderia", BASE_GANADERIA, "admin"))).not.toContain("/dashboard/terceros");
    expect(hrefs(sesion("cafe", [], null, "owner"))).toEqual([]);
  });

  it("con el módulo activo, owner y admin ven Terceros y Tarifas (salvo en café, donde son pestañas de Configuración)", () => {
    expect(hrefs(sesion("ganaderia", ["core.terceros"], null, "owner"))).toEqual(["/dashboard/terceros", "/dashboard/tarifas"]);
    expect(hrefs(sesion("cooperativa", ["core.terceros"], null, "admin"))).toEqual([
      "/dashboard/terceros",
      "/dashboard/tarifas",
    ]);
  });

  it("un viewer ve Terceros pero no Tarifas (solo owner/admin configuran)", () => {
    expect(hrefs(sesion("cooperativa", ["core.terceros"], null, "viewer"))).toEqual(["/dashboard/terceros"]);
    expect(hrefs(sesion("cafe", ["core.terceros"], null, "owner"))).toEqual([]);
  });

  it("se agregan a las pantallas legacy después de ellas y agrupados (Maestros, luego Configuración)", () => {
    const h = hrefs(sesion("ganaderia", modulos, "admin"));
    expect(h.slice(-3)).toEqual(["/dashboard/configuracion", "/dashboard/terceros", "/dashboard/tarifas"]);
    expect(h.slice(0, -2)).toEqual(MENU_BASELINE["admin@velero.test"].map((i) => i.href));
  });
});

describe("getNavParaSesion: tenant de café (CO-21)", () => {
  // Lo que deja `crear_tenant` para café: módulos base + core.terceros y core.auditoria (cafe.dashboard no es
  // base: se le suma para ver el panel).
  const MODULOS_CAFE = [
    "cafe.recepcion",
    "cafe.procesos",
    "cafe.inventario",
    "cafe.remisiones",
    "cafe.dashboard",
    "core.terceros",
    "core.auditoria",
  ];

  const MODULOS_COFRADIA = [...MODULOS_CAFE, "cafe.ventas", "core.equipo"];
  const resumenCafe = (rol: "owner" | "admin" | "operativo" | "viewer") =>
    resumen(sesion("cafe", MODULOS_COFRADIA, null, rol));

  it("admin (A-07): 8 opciones — Panel, el recorrido ①–④, Consultar y Configuración", () => {
    const r = resumenCafe("admin")!;
    expect(r).toHaveLength(8);
    expect(r).toEqual([
      { href: "/dashboard/cafe", label: "Panel", icon: "LayoutDashboard" },
      { href: "/dashboard/cafe/recibir", label: "Recibir café", icon: "ArrowDownCircle" },
      { href: "/dashboard/cafe/planta", label: "Planta", icon: "Factory" },
      { href: "/dashboard/cafe/inventario", label: "Inventario", icon: "Package" },
      { href: "/dashboard/cafe/ventas/nueva", label: "Ventas marca propia", icon: "ArrowUpCircle" },
      { href: "/dashboard/cafe/lotes", label: "Lotes", icon: "Boxes" },
      { href: "/dashboard/cafe/remisiones", label: "Remisiones a terceros", icon: "FileText" },
      { href: "/dashboard/cafe/configuracion", label: "Configuración", icon: "Settings" },
    ]);
  });

  it("los pasos del recorrido van numerados 1–4 en orden", () => {
    const nav = getNavParaSesion(sesion("cafe", MODULOS_COFRADIA, null, "admin"));
    expect(nav.filter((i) => i.grupo === "El recorrido del café").map((i) => [i.numero, i.label])).toEqual([
      [1, "Recibir café"],
      [2, "Planta"],
      [3, "Inventario"],
      [4, "Ventas marca propia"],
    ]);
  });

  it("owner ve lo mismo que admin", () => {
    expect(hrefs(sesion("cafe", MODULOS_COFRADIA, null, "owner"))).toEqual(hrefs(sesion("cafe", MODULOS_COFRADIA, null, "admin")));
  });

  it("operativo (A-07): 6 opciones, sin Panel ni Configuración", () => {
    const r = resumenCafe("operativo")!;
    expect(r.map((i) => i.href)).toEqual([
      "/dashboard/cafe/recibir",
      "/dashboard/cafe/planta",
      "/dashboard/cafe/inventario",
      "/dashboard/cafe/ventas/nueva",
      "/dashboard/cafe/lotes",
      "/dashboard/cafe/remisiones",
    ]);
  });

  it("viewer (gerencia, no se asigna en Cofradía): Panel y lo que consulta, sin Recibir ni Planta ni Configuración", () => {
    expect(resumenCafe("viewer")!.map((i) => i.href)).toEqual([
      "/dashboard/cafe",
      "/dashboard/cafe/inventario",
      "/dashboard/cafe/ventas/nueva",
      "/dashboard/cafe/lotes",
      "/dashboard/cafe/remisiones",
    ]);
  });

  it("Tipos de café, Terceros, Tarifas, Insumos (ahora pestaña de Inventario) y Equipo ya no son entradas de menú en café (viven en Configuración)", () => {
    const h = hrefs(sesion("cafe", MODULOS_COFRADIA, null, "admin"));
    for (const ruta of ["/dashboard/cafe/maestros/tipos", "/dashboard/terceros", "/dashboard/tarifas", "/dashboard/cafe/insumos", "/dashboard/equipo"]) {
      expect(h).not.toContain(ruta);
    }
  });

  it("Configuración se resalta en las pantallas que agrupa", () => {
    const conf = getNavParaSesion(sesion("cafe", MODULOS_COFRADIA, null, "admin")).find((i) => i.label === "Configuración");
    expect(conf?.activaEn).toEqual(expect.arrayContaining(["/dashboard/terceros", "/dashboard/tarifas", "/dashboard/equipo", "/dashboard/cafe/maestros"]));
  });

  it("sin cafe.dashboard no hay Panel (no es módulo base)", () => {
    const sin = MODULOS_CAFE.filter((m) => m !== "cafe.dashboard");
    expect(hrefs(sesion("cafe", sin, null, "admin"))).not.toContain("/dashboard/cafe");
  });

  it("ganadería y cooperativa no ven nada de café aunque tengan los módulos", () => {
    for (const vertical of ["ganaderia", "cooperativa"] as const) {
      const h = hrefs(sesion(vertical, MODULOS_CAFE, vertical === "ganaderia" ? "admin" : "cooperativa_admin"));
      expect(h.filter((x) => x.startsWith("/dashboard/cafe"))).toEqual([]);
    }
  });
});

describe("getNavParaSesion: Equipo (core.equipo)", () => {
  it("sin el módulo no hay entrada: ganadería y cooperativa no lo tienen de serie", () => {
    expect(hrefs(sesion("ganaderia", BASE_GANADERIA, "admin"))).not.toContain("/dashboard/equipo");
    expect(hrefs(sesion("cooperativa", ["core.terceros"], null, "admin"))).not.toContain("/dashboard/equipo");
  });

  it("owner y admin lo ven; un operativo y la gerencia (viewer) no", () => {
    expect(hrefs(sesion("cooperativa", ["core.equipo"], null, "owner"))).toEqual(["/dashboard/equipo"]);
    expect(hrefs(sesion("cooperativa", ["core.equipo"], null, "admin"))).toEqual(["/dashboard/equipo"]);
    expect(hrefs(sesion("cooperativa", ["core.equipo"], null, "operativo"))).toEqual([]);
    expect(hrefs(sesion("cooperativa", ["core.equipo"], null, "viewer"))).toEqual([]);
    // En café es una pestaña de Configuración, no una entrada.
    expect(hrefs(sesion("cafe", ["core.equipo"], null, "owner"))).toEqual([]);
  });

  it("va en Maestros, después de Terceros y de Tarifas y parámetros", () => {
    expect(hrefs(sesion("cooperativa", ["core.terceros", "core.equipo"], null, "admin"))).toEqual([
      "/dashboard/terceros",
      "/dashboard/tarifas",
      "/dashboard/equipo",
    ]);
  });
});

describe("ocultoEnPWA", () => {
  it("solo oculta en la PWA, y solo a quien trabaja en ruta", () => {
    const item = { hideInPWA: true };
    expect(ocultoEnPWA(item, "cooperativa_user", true)).toBe(true);
    expect(ocultoEnPWA(item, "cooperativa_user", false)).toBe(false);
    expect(ocultoEnPWA(item, "cooperativa_admin", true)).toBe(false);
    expect(ocultoEnPWA(item, null, true)).toBe(false);
    expect(ocultoEnPWA({}, "cooperativa_user", true)).toBe(false);
  });
});

describe("integridad de los manifiestos", () => {
  const items = MANIFIESTOS.flatMap((m) => m.nav.map((item) => ({ vertical: m.vertical, item })));

  it("no repite rutas ni orden dentro de un mismo grupo", () => {
    const rutas = items.map(({ item }) => item.href);
    expect(new Set(rutas).size).toBe(rutas.length);
    const posiciones = items.map(({ item }) => `${item.grupo ?? ""}|${item.orden}`);
    expect(new Set(posiciones).size).toBe(posiciones.length);
  });

  it("cada entrada usa un módulo del catálogo y un icono conocido", () => {
    for (const { item } of items) {
      expect(MODULOS).toContain(item.modulo);
      expect(ICONOS_NAV).toContain(item.icon);
    }
  });

  it("el módulo de cada entrada es de su vertical (o del núcleo)", () => {
    for (const { vertical, item } of items) {
      const prefijo = item.modulo.split(".")[0];
      expect(prefijo === vertical || prefijo === "core").toBe(true);
    }
  });

  it("toda entrada declara algún rol (nunca queda abierta a todos)", () => {
    for (const { item } of items) {
      expect((item.roles?.length ?? 0) + (item.rolesLegacy?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  it("cada vertical tiene su manifiesto, más el del núcleo", () => {
    expect(MANIFIESTOS.map((m) => m.vertical).sort()).toEqual(["cafe", "cooperativa", "core", "ganaderia"]);
  });

  it("registra los exportadores a Excel del núcleo y de café", () => {
    expect(getExportador("terceros")?.modulo).toBe("core.terceros");
    expect(getExportador("cafe-lotes")?.modulo).toBe("cafe.recepcion");
  });
});
