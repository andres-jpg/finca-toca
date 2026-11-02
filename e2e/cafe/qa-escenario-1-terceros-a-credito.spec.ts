import { expect, test, usarRol } from "../fixtures/test";
import { crearRecepcion, registrarTrilla } from "../helpers/api";
import { abrirPlanta, conComa, elegirTueste, irA, NAVEGACION_LENTA, numeroDelCampo, registrarPaso, textoDelAviso } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA FIN-140 · escenario 1 «Terceros a crédito»: 220 kg de pergamino con trilla, tostión (medio, 205 °C, 12 min) y molienda;
// tostión con pesaje agrupado en dos baches; empaque 12 × 10 kg + 5 × 5 kg con la diferencia «se entrega suelto»; entrega
// junto con otro lote listo del mismo cliente (UNA remisión). Por la interfaz, salvo el segundo lote (punto de partida).

test("terceros a crédito: recepción, trilla, tostión agrupada, molienda, empaque y entrega de dos lotes @tablet", async ({ page }) => {
  // El otro lote listo del mismo cliente (solo trilla, ya trillado) para entregarlo en la misma remisión.
  const otro = await crearRecepcion({ servicios: ["trilla"], bultos: 2, pesoKg: 125 });
  await registrarTrilla(otro, 125, 101.25);

  // --- 1. Recepción: 4 bultos, 220 kg, trilla + tostión (medio, 205 °C, 12 min) + molienda ----------------------------------
  await irA(page, "/dashboard/cafe/recibir?tipo=servicios");
  await page.getByText("Selecciona o crea el cliente").click();
  await page.getByRole("option", { name: /Cliente E2E/ }).click();
  await page.getByLabel("Número de bultos").fill("4");
  await page.getByLabel("Peso total (kg)").fill("220");
  for (const servicio of ["Trilla", "Tostión", "Molienda"]) {
    await page.getByRole("button", { name: servicio, exact: true }).click();
  }
  await elegirTueste(page, "Medio");
  await page.getByLabel("Temperatura pedida (°C) · opcional").fill("205");
  await page.getByLabel("Tiempo pedido (min) · opcional").fill("12");
  await page.getByRole("button", { name: "Guardar y enviar a planta" }).click();
  const codigo = (await textoDelAviso(page, /Recepción registrada: MQ-/)).match(/MQ-\d{4}-\d+/)?.[0];
  expect(codigo, "el aviso trae el código del lote MQ").toBeTruthy();

  // --- 2. Trilla 220 → 178,2 kg (19 %) --------------------------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByLabel("Peso de entrada (kg)")).toHaveValue("220");
  await page.getByLabel("Peso de salida (kg)").fill("178,2");
  await registrarPaso(page, "Registrar trilla");

  // --- 3. Tostión: el pedido del cliente se ve y dos baches se pesan juntos ---------------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("button", { name: "Sugerir baches" }).click();
  await expect(page.getByText(/Pedido del cliente:.*205,0 °C.*12,0 min/)).toBeVisible();
  const entradas = page.getByLabel(/^Bache \d+, kg de entrada$/);
  const n = await entradas.count();
  expect(n).toBeGreaterThan(2);

  await page.getByRole("radio", { name: "Agrupado", exact: true }).click();
  await page.getByRole("checkbox", { name: "Seleccionar el bache 1 para agrupar" }).check();
  await page.getByRole("checkbox", { name: "Seleccionar el bache 2 para agrupar" }).check();
  await page.getByRole("button", { name: /^Agrupar seleccionados \(2\)/ }).click();
  const juntos = (await numeroDelCampo(entradas.nth(0))) + (await numeroDelCampo(entradas.nth(1)));
  await page.getByLabel("Grupo 1, kg de salida del grupo").fill(conComa(Math.round(juntos * 82 * 10) / 1000));
  for (let i = 3; i <= n; i++) {
    const entrada = await numeroDelCampo(page.getByLabel(`Bache ${i}, kg de entrada`, { exact: true }));
    await page.getByLabel(`Bache ${i}, kg de salida`, { exact: true }).fill(conComa(Math.round(entrada * 82 * 10) / 1000));
  }
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con la entrada" })).toBeVisible();
  await registrarPaso(page, "Registrar tostión");

  // --- 4. Molienda: lo tostado (≈146,1 kg) → 146 kg -----------------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByLabel("Peso de salida (kg)").fill("146");
  await registrarPaso(page, "Registrar molienda");

  // --- 5. Empaque: 12 × 10 kg + 5 × 5 kg = 145 kg; el kilo que sobra se entrega suelto -----------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByLabel("Peso de la bolsa (kg)").fill("10");
  await page.getByLabel("Cantidad", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Otro tamaño de bolsa" }).click();
  await page.getByLabel("Peso de la bolsa (kg)").nth(1).fill("5");
  await page.getByLabel("Cantidad", { exact: true }).nth(1).fill("5");
  await expect(page.getByRole("button", { name: "Registrar empaque" })).toBeDisabled(); // sobra café: falta decir adónde fue
  await page.getByRole("radio", { name: "Se entrega suelto al cliente" }).click();
  await page.getByRole("button", { name: "Registrar empaque" }).click();

  // Era el último servicio: se ofrece entregar ahora y llega con el lote preseleccionado.
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toContainText("Lote listo");
  await dialogo.getByRole("button", { name: "Entregar ahora" }).click();
  await expect(page).toHaveURL(/\/planta\/entregar\?lote=/, { timeout: NAVEGACION_LENTA });
  await expect(page.getByRole("checkbox", { name: new RegExp(codigo!) })).toBeChecked();

  // --- 6. Una sola remisión con los dos lotes del cliente -----------------------------------------------------------------------
  await page.getByRole("checkbox", { name: new RegExp(otro.codigo) }).check();
  const resumen = page.getByRole("complementary", { name: "Resumen de la entrega" });
  await expect(resumen).toContainText(codigo!);
  await expect(resumen).toContainText(otro.codigo);
  await page.getByLabel("Nombre de quien recibe").fill("Ana Torres");
  await page.getByLabel("Cédula").fill("43123456");
  await page.getByRole("button", { name: "Entregar e imprimir remisión" }).click();
  const numero = (await textoDelAviso(page, /Remisión REM-.* generada/)).match(/REM-\d{4}-\d+/)?.[0];
  expect(numero).toBeTruthy();
  await expect(page).toHaveURL(/\/print\/remision\/[0-9a-f-]{36}/, { timeout: NAVEGACION_LENTA });
  await expect(page.locator(".ticket").first()).toContainText(codigo!);
  await expect(page.locator(".ticket").first()).toContainText(otro.codigo);

  await irA(page, `/dashboard/cafe/remisiones?tab=todas&q=${numero}`);
  await expect(page.getByRole("row").filter({ hasText: numero! })).toContainText(otro.codigo);
});
