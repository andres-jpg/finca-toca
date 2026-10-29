import { expect, test, usarRol } from "../fixtures/test";
import {
  abrirFichaDeLote,
  abrirPlanta,
  aviso,
  elegirTueste,
  irA,
  llenarSalidaDeBaches,
  registrarPaso,
  textoDelAviso,
} from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 2 (HU-F1-02, 03, 04, 13): el ejemplo del informe de Cofradía. Un cliente trae 500 kg de pergamino con la
// humedad alta (el sistema avisa y deja guardar) y contrata trilla + tostión + molienda. Trilla 500 → 405, tostión con
// los 30 baches sugeridos, molienda, empaque (incluido en la maquila), remisión de entrega impresa con copia y lote
// «Entregado». Todo por la interfaz.

test("servicio trilla + maquila: recepción con aviso de humedad, planta completa, remisión con copia @tablet", async ({
  page,
  context,
}) => {
  // --- 1. Recepción: 500 kg, 8 bultos, humedad 13 % (rango 10–12 %) ---------------------------------------------------
  await irA(page, "/dashboard/cafe/lotes/nueva-recepcion");
  await page.getByText("Selecciona o crea el cliente").click();
  await page.getByRole("option", { name: /Cliente E2E/ }).click();
  await page.getByLabel("Número de bultos").fill("8"); // 8 × 62,5 kg = 500 kg
  await expect(page.getByLabel("Peso total (kg)")).toHaveValue("500");
  await page.getByLabel("Humedad (%)").fill("13");
  await expect(page.getByRole("status").filter({ hasText: "Humedad 13 % fuera del rango 10–12 %" })).toContainText(
    "Puedes guardar igualmente",
  );
  await page.getByLabel("Densidad").fill("680");
  await page.getByRole("checkbox", { name: /^Trilla/ }).check();
  await page.getByRole("checkbox", { name: /^Tostión/ }).check();
  await page.getByRole("checkbox", { name: /^Molienda/ }).check();
  await elegirTueste(page, "Medio");
  await page.getByRole("button", { name: "Registrar recepción" }).click();

  const codigo = (await textoDelAviso(page, /Recepción registrada: MQ-/)).match(/MQ-\d{4}-\d+/)?.[0];
  expect(codigo, "el aviso trae el código del lote MQ").toBeTruthy();
  // La alerta de calidad avisa, pero el lote se guardó.
  await expect(aviso(page, /Alertas de calidad: Humedad alta/)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes$/);

  // --- 2. Trilla: 500 → 405 kg (merma 19 %, la de referencia) -------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByText("Calidad al recibir: Humedad alta")).toBeVisible();
  await expect(page.getByLabel("Peso de entrada (kg)")).toHaveValue("500");
  await page.getByLabel("Peso de salida (kg)").fill("405");
  const merma = page.getByRole("region", { name: "Merma" });
  await expect(merma).toContainText(/19(,0)? %/);
  await expect(merma).toContainText("Referencia 19 % ± 3 puntos");
  await expect(merma).toContainText("Tarifa vigente"); // trilla: $1.400/kg, se cobra en servicios
  await expect(merma).not.toContainText("Revisa el pesaje"); // en la referencia: sin aviso de desvío
  await registrarPaso(page, "Registrar trilla");

  // --- 3. Tostión: entrada 405 kg → 30 baches sugeridos -----------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByLabel("Peso de entrada (kg)")).toHaveValue("405");
  await page.getByRole("button", { name: "Sugerir baches" }).click();
  await expect(page.getByRole("heading", { name: "Baches (30)" })).toBeVisible();
  await llenarSalidaDeBaches(page, 18);
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con la entrada" })).toBeVisible();
  await registrarPaso(page, "Registrar tostión");

  // --- 4. Molienda y empaque (incluido, sin coste) ----------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByLabel("Peso de salida (kg)").fill("330");
  await registrarPaso(page, "Registrar molienda");

  await abrirPlanta(page, codigo!);
  await page.getByLabel("Peso de salida (kg)").fill("329");
  await registrarPaso(page, "Registrar empaque");

  // El lote queda listo para entregar.
  await irA(page, `/dashboard/cafe/lotes?q=${codigo}`);
  await expect(page.getByRole("row").filter({ hasText: codigo! })).toContainText("Listo");

  // --- 5. Remisión de entrega ---------------------------------------------------------------------------------------------
  await abrirFichaDeLote(page, codigo!);
  await page.getByRole("button", { name: "Generar remisión" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Recibe (opcional)").fill("Juan Pérez");
  await dialogo.getByRole("button", { name: "Generar remisión" }).click();
  const numeroRemision = (await textoDelAviso(page, /Remisión REM-.* generada/)).match(/REM-\d{4}-\d+/)?.[0];
  expect(numeroRemision, "el aviso trae el número de la remisión").toBeTruthy();

  const seccion = page.getByRole("region", { name: "Remisión de entrega" });
  await expect(seccion).toContainText(numeroRemision!);
  await expect(seccion).toContainText("Vigente");

  // --- 6. Imprimir con copia: el tiquete trae dos hojas (original y COPIA CLIENTE) ----------------------------------------
  const [impresion] = await Promise.all([
    context.waitForEvent("page"),
    seccion.getByRole("link", { name: "Imprimir con copia" }).click(),
  ]);
  await impresion.waitForLoadState("domcontentloaded");
  await expect(impresion).toHaveURL(/\/print\/remision\/[0-9a-f-]{36}\?copias=2$/);
  await expect(impresion.locator(".ticket")).toHaveCount(2);
  await expect(impresion.getByText("COPIA CLIENTE")).toHaveCount(1);
  for (const ticket of await impresion.locator(".ticket").all()) {
    await expect(ticket).toContainText(numeroRemision!);
    await expect(ticket).toContainText(codigo!);
    await expect(ticket).toContainText("Cliente E2E");
    await expect(ticket).toContainText("Peso entregado");
  }
  await expect(impresion.getByRole("button", { name: "Imprimir con copia" })).toBeVisible();
  await impresion.close();

  // --- 7. El lote queda «Entregado» ---------------------------------------------------------------------------------------------
  await irA(page, `/dashboard/cafe/lotes?q=${codigo}`);
  await expect(page.getByRole("row").filter({ hasText: codigo! })).toContainText("Entregado");
});
