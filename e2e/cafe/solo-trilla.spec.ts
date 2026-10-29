import { expect, test, usarRol } from "../fixtures/test";
import { abrirFichaDeLote, abrirPlanta, aviso, irA, textoDelAviso } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 3 (HU-F1-02, 04, 13): servicio de solo trilla. La merma sale del 25 % cuando la de referencia es 19 % ± 3:
// el sistema avisa en pantalla (y marca el proceso para revisión) pero no impide guardar; después se entrega con remisión.

test("solo trilla con desvío de merma y remisión", async ({ page }) => {
  // --- 1. Recepción de 2 bultos (125 kg) solo para trilla: dentro de rangos, sin alertas de calidad -------------------------
  await irA(page, "/dashboard/cafe/lotes/nueva-recepcion");
  await page.getByText("Selecciona o crea el cliente").click();
  await page.getByRole("option", { name: /Cliente E2E/ }).click();
  await page.getByLabel("Número de bultos").fill("2");
  await page.getByLabel("Humedad (%)").fill("11");
  await page.getByLabel("Densidad").fill("680");
  await page.getByRole("checkbox", { name: /^Trilla/ }).check();
  await page.getByRole("button", { name: "Registrar recepción" }).click();
  const codigo = (await textoDelAviso(page, /Recepción registrada: MQ-/)).match(/MQ-\d{4}-\d+/)?.[0];
  expect(codigo, "el aviso trae el código del lote MQ").toBeTruthy();

  // --- 2. Trilla 125 → 93,75 kg: merma 25 % -------------------------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByLabel("Peso de entrada (kg)")).toHaveValue("125");
  await page.getByLabel("Peso de salida (kg)").fill("93,75");
  const merma = page.getByRole("region", { name: "Merma" });
  await expect(merma).toContainText(/25(,0)? %/);
  // El aviso de desvío cita la referencia y deja claro que se puede guardar igualmente.
  await expect(merma).toContainText("Referencia 19 % ± 3 puntos");
  await expect(merma).toContainText("Revisa el pesaje. Puedes guardar igualmente");
  await page.getByRole("button", { name: "Registrar trilla" }).click();
  await expect(aviso(page, /La merma se desvió de la referencia/)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/planta$/);

  // El proceso queda marcado: el listado de lotes enseña la alerta y el lote ya está listo (un solo servicio).
  await irA(page, `/dashboard/cafe/lotes?q=${codigo}`);
  const fila = page.getByRole("row").filter({ hasText: codigo! });
  await expect(fila).toContainText("Listo");
  await expect(fila).toContainText("Merma desviada");

  // --- 3. Remisión de entrega ------------------------------------------------------------------------------------------------------
  await abrirFichaDeLote(page, codigo!);
  await page.getByRole("button", { name: "Generar remisión" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Generar remisión" }).click();
  const numero = (await textoDelAviso(page, /Remisión REM-.* generada/)).match(/REM-\d{4}-\d+/)?.[0];
  expect(numero).toBeTruthy();
  await expect(page.getByRole("region", { name: "Remisión de entrega" })).toContainText(numero!);

  // Y aparece en el listado de remisiones, vigente.
  await irA(page, `/dashboard/cafe/remisiones?q=${numero}`);
  const filaRemision = page.getByRole("row").filter({ hasText: numero! });
  await expect(filaRemision).toContainText(codigo!);
  await expect(filaRemision).toContainText("Vigente");
});
