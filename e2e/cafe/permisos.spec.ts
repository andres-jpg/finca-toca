import ExcelJS from "exceljs";
import { SLUG_CAFE } from "../fixtures/auth";
import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, crearRecepcion } from "../helpers/api";
import { abrirFichaDeLote, abrirPlanta, irA } from "../helpers/ui";

// Escenario 4 (HU-F1-04 y HU-F1-11): el orden de los pasos y lo que cada rol ve y puede hacer. Esconder una opción es
// cosmético (las acciones y el RLS vuelven a comprobarlo), pero es lo que el usuario experimenta, y las URL tecleadas a
// mano deben llevarle a un sitio válido.

test.describe("operativo", () => {
  test.use(usarRol("cafeOperativo"));

  test("no puede tostar antes de trillar: la opción sale deshabilitada y dice por qué @tablet", async ({ page }) => {
    // Lote de servicio con trilla + tostión recién recibido (sin ningún proceso).
    const lote = await crearRecepcion({ servicios: ["trilla", "tostion"], bultos: 2, pesoKg: 125 });
    await abrirPlanta(page, lote.codigo);

    const pasos = page.getByRole("radiogroup", { name: "Paso a registrar" });
    const trilla = pasos.getByRole("radio", { name: /^Trilla/ });
    const tostion = pasos.getByRole("radio", { name: /^Tostión/ });
    await expect(trilla).toBeChecked();
    await expect(trilla).toBeEnabled();
    await expect(tostion).toBeDisabled();
    await expect(tostion).toContainText("Primero registra la trilla");
    // Y no hay formulario de tostión: solo el de la trilla.
    await expect(page.getByRole("button", { name: "Registrar trilla" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar tostión" })).toHaveCount(0);
  });

  test("no ve Tipos de café, Tarifas ni Equipo, y las URL a mano lo devuelven a su inicio", async ({ page }) => {
    await irA(page, "/dashboard/cafe/lotes");
    const menu = page.getByRole("navigation");
    for (const visible of ["Lotes", "Planta", "Producto terminado", "Insumos", "Ventas", "Remisiones", "Panel", "Terceros"]) {
      await expect(menu.getByRole("link", { name: visible, exact: true }), `ve «${visible}»`).toBeVisible();
    }
    for (const oculto of ["Tipos de café", "Tarifas y parámetros", "Equipo"]) {
      await expect(menu.getByRole("link", { name: oculto, exact: true }), `no ve «${oculto}»`).toHaveCount(0);
    }

    for (const ruta of ["/dashboard/cafe/maestros/tipos", "/dashboard/tarifas", "/dashboard/equipo"]) {
      await page.goto(ruta);
      await page.waitForURL((url) => !url.pathname.startsWith(ruta));
      await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes/);
    }
  });
});

test.describe("gerencia", () => {
  test.use(usarRol("cafeGerencia"));

  test("consulta sin ver Planta ni botones de acción, y exporta los lotes a Excel", async ({ page }) => {
    const lote = await crearCompra({ bultos: 2 });

    // Menú: ve lo que consulta, no la Planta ni los maestros.
    await irA(page, "/dashboard/cafe/lotes");
    const menu = page.getByRole("navigation");
    for (const visible of ["Lotes", "Producto terminado", "Insumos", "Ventas", "Remisiones", "Panel", "Terceros"]) {
      await expect(menu.getByRole("link", { name: visible, exact: true }), `ve «${visible}»`).toBeVisible();
    }
    for (const oculto of ["Planta", "Tipos de café", "Tarifas y parámetros", "Equipo"]) {
      await expect(menu.getByRole("link", { name: oculto, exact: true }), `no ve «${oculto}»`).toHaveCount(0);
    }

    // Listado sin botones de registro...
    await expect(page.getByRole("link", { name: "Nueva compra" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Nueva recepción" })).toHaveCount(0);
    await page.goto("/dashboard/cafe/planta");
    await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes/);
    await page.goto("/dashboard/cafe/lotes/nueva-compra");
    await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes$/);

    // ...ni en la ficha del lote (ni «Ir a planta» ni «Generar remisión» ni «Anular lote»).
    await abrirFichaDeLote(page, lote.codigo);
    await expect(page.getByRole("link", { name: "Ir a planta" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Generar remisión|Anular lote/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(lote.codigo);

    // Exportar sí: el Excel respeta el filtro de la pantalla (solo el lote buscado).
    await irA(page, `/dashboard/cafe/lotes?q=${lote.codigo}`);
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exportar" }).click()]);
    expect(descarga.suggestedFilename()).toMatch(new RegExp(`^${SLUG_CAFE}_cafe-lotes.*\\.xlsx$`));

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.readFile((await descarga.path())!);
    expect(libro.worksheets.map((h) => h.name)).toEqual(expect.arrayContaining(["Lotes", "Procesos"]));
    const hoja = libro.getWorksheet("Lotes")!;
    const celdas: string[] = [];
    hoja.eachRow((fila) => fila.eachCell((c) => celdas.push(String(c.text))));
    expect(celdas, "el cliente va en el encabezado").toContain("Cofradía (E2E)");
    expect(celdas, "el lote filtrado va en la hoja").toContain(lote.codigo);
  });
});
