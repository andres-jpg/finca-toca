import { expect, test, usarRol } from "../fixtures/test";
import { crearRecepcion, registrarTostion, registrarTrilla } from "../helpers/api";
import { irA, textoDelAviso, NAVEGACION_LENTA } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 7 (A-14, HU-F1-13): entrega de varios lotes listos de un mismo cliente en UNA remisión, desde
// /dashboard/cafe/planta/entregar. Recibe nombre y cédula son obligatorios. Punto de partida por la API (dos lotes de
// solo trilla ya trillados); lo que se prueba, por la interfaz.

test("entrega multi-lote: dos lotes del cliente en una sola remisión con quién recibe", async ({ page }) => {
  const a = await crearRecepcion({ servicios: ["trilla"], pesoKg: 125 });
  const b = await crearRecepcion({ servicios: ["trilla"], pesoKg: 125 });
  await registrarTrilla(a, 125, 101.25);
  await registrarTrilla(b, 125, 101.25);

  await irA(page, "/dashboard/cafe/planta/entregar");
  await expect(page.getByRole("heading", { level: 1, name: "Entregar" })).toBeVisible();

  // 1 · Cliente (un lote no se entrega hasta elegir cliente).
  const cliente = page.getByLabel("Cliente", { exact: true });
  const valor = await cliente.locator("option").filter({ hasText: /^Cliente E2E/ }).first().getAttribute("value");
  expect(valor, "Cliente E2E tiene lotes listos").toBeTruthy();
  await cliente.selectOption(valor!);

  // 2 · Lotes listos: se eligen los dos del test.
  await page.getByRole("checkbox", { name: new RegExp(a.codigo) }).check();
  await page.getByRole("checkbox", { name: new RegExp(b.codigo) }).check();
  const resumen = page.getByRole("complementary", { name: "Resumen de la entrega" });
  await expect(resumen).toContainText(a.codigo);
  await expect(resumen).toContainText(b.codigo);
  await expect(resumen).toContainText("la remisión no es una factura", { ignoreCase: true });

  // 3 · Quién recibe: sin nombre y cédula no se entrega.
  await page.getByRole("button", { name: "Entregar e imprimir remisión" }).click();
  await expect(page).toHaveURL(/\/planta\/entregar/, { timeout: NAVEGACION_LENTA });
  await expect(page.getByLabel("Nombre de quien recibe")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Nombre de quien recibe").fill("María Gómez");
  await page.getByLabel("Cédula").fill("52123456");
  await page.getByRole("button", { name: "Entregar e imprimir remisión" }).click();

  const numero = (await textoDelAviso(page, /Remisión REM-.* generada/)).match(/REM-\d{4}-\d+/)?.[0];
  expect(numero, "el aviso trae el número de la remisión").toBeTruthy();

  // El tiquete trae los dos lotes y quién recibió; con copia = 2 hojas.
  await expect(page).toHaveURL(/\/print\/remision\/[0-9a-f-]{36}\?copias=2$/, { timeout: NAVEGACION_LENTA });
  const tiquete = page.locator(".ticket").first();
  await expect(tiquete).toContainText(a.codigo);
  await expect(tiquete).toContainText(b.codigo);
  await expect(tiquete).toContainText("María Gómez");
  await expect(page.locator(".ticket")).toHaveCount(2);

  // Los dos lotes quedan entregados con ESA remisión; ya no se ofrecen para entregar.
  for (const lote of [a, b]) {
    await irA(page, `/dashboard/cafe/lotes?q=${lote.codigo}`);
    await expect(page.getByRole("row").filter({ hasText: lote.codigo })).toContainText("Entregado");
  }
  await irA(page, `/dashboard/cafe/remisiones?tab=todas&q=${numero}`);
  const fila = page.getByRole("row").filter({ hasText: numero! });
  await expect(fila).toContainText(a.codigo);
  await expect(fila).toContainText("Entregada");
});

// Tras registrar el último servicio de un lote de terceros se ofrece «Lote listo · ¿Entregar ahora?». El diálogo lo pinta la
// página (`?listo=1`), no el formulario, que la revalidación desmonta (bug corregido).
test("empaque del último servicio: ofrece «Entregar ahora» y lleva a /planta/entregar con el lote", async ({ page }) => {
  const lote = await crearRecepcion({ servicios: ["trilla", "tostion"], pesoKg: 62.5 });
  await registrarTrilla(lote, 62.5, 50.625);
  const tostado = await registrarTostion(lote, 50.625);
  await irA(page, `/dashboard/cafe/planta/${lote.id}`);
  await page.getByRole("radio", { name: /^Empaque/ }).click();
  // Terceros: líneas de bolsas del cliente de peso libre y el peso total en báscula (incluye el sobrante).
  await page.getByRole("radio", { name: "Otro (kg)" }).click();
  await page.getByLabel("Peso por bolsa en kilos").fill("1");
  await page.getByLabel("Número de bolsas").fill(String(Math.floor(tostado)));
  await page.getByLabel("Peso total en báscula (kg)").fill(String(tostado).replace(".", ","));
  await page.getByRole("button", { name: "Registrar empaque" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("Lote listo");
  await dialogo.getByRole("button", { name: "Entregar ahora" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/cafe/planta/entregar\\?lote=${lote.id}`), { timeout: NAVEGACION_LENTA });
  // El lote llega preseleccionado.
  await expect(page.getByRole("checkbox", { name: new RegExp(lote.codigo) })).toBeChecked();
});
