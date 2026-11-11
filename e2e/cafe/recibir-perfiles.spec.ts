import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra, crearRecepcion } from "../helpers/api";
import { abrirPlanta, aviso, irA, NAVEGACION_LENTA, textoDelAviso } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// B-02 (FIN-148): Recibir café. Marca propia no muestra panel de perfil y su tostión abre con el perfil del tipo (Excelso 216 °C · 17 min);
// terceros abre con el perfil de maquila (222 °C · 17 min) y admite varios perfiles por kilos.

test("marca propia: sin panel de perfil y la tostión abre con 216 °C · 17 min @tablet", async ({ page }) => {
  await irA(page, "/dashboard/cafe/recibir?tipo=marca-propia");
  await expect(page.getByRole("heading", { name: "Perfil de tueste" })).toHaveCount(0);

  const lote = await crearCompra({ tipo: "Excelso", pesoKg: 40.5 });
  await abrirPlanta(page, lote.codigo);
  const temp = page.getByLabel("Bache 1, temperatura en grados (opcional)");
  await expect(temp).toHaveValue("216");
  await expect(page.getByLabel("Bache 1, tiempo en minutos (opcional)")).toHaveValue("17");
});

test("terceros: perfil de maquila precargado y varios perfiles por kilos @tablet", async ({ page }) => {
  await irA(page, "/dashboard/cafe/recibir?tipo=servicios");
  await page.getByText("Selecciona o crea el cliente").click();
  await page.getByRole("option", { name: /Cliente E2E/ }).click();
  await page.getByLabel("Peso recibido (kg)").fill("40.5");
  await page.getByRole("button", { name: "Tostión", exact: true }).click();

  // Un perfil, precargado con el de maquila: sin digitar nada.
  const panel = page.getByTestId("panel-perfil-tueste");
  await expect(panel.getByRole("radio", { name: "Medio", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(panel.getByLabel("Temperatura (°C)")).toHaveValue("222");
  await expect(panel.getByLabel("Tiempo (min)")).toHaveValue("17");

  // Varios perfiles: 27,0 + 10,0 no suma 40,5 kg.
  await panel.getByRole("radio", { name: "Varios perfiles" }).click();
  await expect(panel.getByTestId("fila-perfil")).toHaveCount(2);
  await panel.getByLabel("Kilos").nth(0).fill("27");
  await panel.getByLabel("Kilos").nth(1).fill("10");
  await expect(panel.getByRole("status")).toContainText("Deben sumar 40,5 kg");
  await page.getByRole("button", { name: "Guardar y enviar a planta" }).click();
  await expect(page.getByText("Los kilos por perfil deben sumar 40,5 kg")).toBeVisible();

  // 27,0 + 13,5 guarda.
  await panel.getByLabel("Kilos").nth(1).fill("13.5");
  await page.getByRole("button", { name: "Guardar y enviar a planta" }).click();
  const codigo = (await textoDelAviso(page, /Recepción registrada: MQ-/)).match(/MQ-\d{4}-\d+/)?.[0];
  expect(codigo).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/lotes$/, { timeout: NAVEGACION_LENTA });
  await expect(aviso(page, /Recepción registrada/)).toBeVisible();
});

test("tostión de un lote con varios perfiles: baches por perfil con columna Perfil @tablet", async ({ page }) => {
  const lote = await crearRecepcion({
    servicios: ["tostion"],
    pesoKg: 40.5,
    perfiles: [
      { nivel: "medio", tempC: 222, tiempoMin: 17, kg: 27 },
      { nivel: "alto", tempC: 230, tiempoMin: 15, kg: 13.5 },
    ],
  });
  await abrirPlanta(page, lote.codigo);
  await expect(page.getByLabel("Kilos a tostar ahora")).toHaveValue("40,5");
  await expect(page.getByRole("heading", { name: "Baches (3)" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Perfil" })).toBeVisible();
  await expect(page.getByLabel("Bache 1, temperatura en grados (opcional)")).toHaveValue("222");
  await expect(page.getByLabel("Bache 3, temperatura en grados (opcional)")).toHaveValue("230");
  await expect(page.getByText("Perfil 2", { exact: true }).first()).toBeVisible();
});
