import { expect, test, usarRol } from "../fixtures/test";
import { crearCompra } from "../helpers/api";
import { abrirPlanta, aviso, conComa, elegirTueste, NAVEGACION_LENTA, numeroDelCampo } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// Escenario 8 (A-12): tostión por baches con tiempo y temperatura reales por bache y pesaje AGRUPADO (varios baches que se
// pesan juntos comparten un solo peso de salida). Punto de partida por la API (compra de 125 kg de marca propia).

test("tostión con baches: tiempo y temperatura reales y dos baches pesados en grupo @tablet", async ({ page }) => {
  const lote = await crearCompra({ bultos: 2, pesoKg: 125 });
  await abrirPlanta(page, lote.codigo);

  await page.getByRole("button", { name: "Sugerir baches" }).click();
  await expect(page.getByRole("heading", { name: "Baches (10)" })).toBeVisible();

  // Tiempo y temperatura reales (opcionales) del primer bache.
  await page.getByLabel("Bache 1, temperatura real en grados (opcional)").fill("205");
  await page.getByLabel("Bache 1, tiempo real en minutos (opcional)").fill("12");
  await expect(page.getByLabel("Bache 1, temperatura real en grados (opcional)")).toHaveValue("205");
  await expect(page.getByLabel("Bache 1, tiempo real en minutos (opcional)")).toHaveValue("12");

  // Pesaje agrupado: los baches 1 y 2 se pesaron juntos (25 kg entran, 20,5 kg salen = 18 % de merma).
  await page.getByRole("radio", { name: "Agrupado", exact: true }).click();
  await page.getByRole("checkbox", { name: "Seleccionar el bache 1 para agrupar" }).check();
  await page.getByRole("checkbox", { name: "Seleccionar el bache 2 para agrupar" }).check();
  await page.getByRole("button", { name: /^Agrupar seleccionados \(2\)/ }).click();
  await expect(page.getByText("Grupo 1").first()).toBeVisible();
  await expect(page.getByText(/Baches 1 \+ 2 · entran/)).toBeVisible();
  await page.getByLabel("Grupo 1, kg de salida del grupo").fill(conComa(20.5));
  // El tiempo del bache 1 sobrevive al agrupar.
  await expect(page.getByLabel("Bache 1, tiempo real en minutos (opcional)")).toHaveValue("12");

  // Los 8 baches restantes se pesan uno a uno (los agrupados ya no tienen campo de salida propio).
  for (let i = 3; i <= 10; i++) {
    const entrada = await numeroDelCampo(page.getByLabel(`Bache ${i}, kg de entrada`, { exact: true }));
    await page.getByLabel(`Bache ${i}, kg de salida`, { exact: true }).fill(conComa(Math.round(entrada * 82 * 10) / 1000));
  }
  await expect(page.getByLabel("Bache 1, kg de salida", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con la entrada" })).toBeVisible();

  await elegirTueste(page, "Medio");
  await page.getByRole("button", { name: "Registrar tostión" }).click();
  await expect(aviso(page, /Tostión registrada/i)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/planta$/, { timeout: NAVEGACION_LENTA });

  // La ficha del lote conserva el proceso con sus 10 baches.
  await abrirPlanta(page, lote.codigo);
  await expect(page.getByText("10 baches")).toBeVisible();
});
