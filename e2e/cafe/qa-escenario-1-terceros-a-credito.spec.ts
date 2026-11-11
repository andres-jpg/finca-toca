import { expect, test, usarRol } from "../fixtures/test";
import { crearRecepcion, registrarTrilla } from "../helpers/api";
import { abrirPlanta, elegirTueste, irA, NAVEGACION_LENTA, registrarPaso, textoDelAviso } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA FIN-140 · escenario 1 «Terceros a crédito»: 220 kg de pergamino con trilla, tostión (medio, 205 °C, 12 min) y molienda;
// tostión sin peso de salida; empaque 12 × 10 kg + 5 × 5 kg con báscula y sobrante entregado a granel; entrega
// junto con otro lote listo del mismo cliente (UNA remisión). Por la interfaz, salvo el segundo lote (punto de partida).

test("terceros a crédito: recepción, trilla, tostión por tandas, molienda, empaque y entrega de dos lotes @tablet", async ({ page }) => {
  // El otro lote listo del mismo cliente (solo trilla, ya trillado) para entregarlo en la misma remisión.
  const otro = await crearRecepcion({ servicios: ["trilla"], pesoKg: 125 });
  await registrarTrilla(otro, 125, 101.25);

  // --- 1. Recepción: 220 kg, trilla + tostión (medio, 205 °C, 12 min) + molienda ----------------------------------
  await irA(page, "/dashboard/cafe/recibir?tipo=servicios");
  await page.getByText("Selecciona o crea el cliente").click();
  await page.getByRole("option", { name: /Cliente E2E/ }).click();
  await page.getByLabel("Peso recibido (kg)").fill("220");
  for (const servicio of ["Trilla", "Tostión", "Molienda"]) {
    await page.getByRole("button", { name: servicio, exact: true }).click();
  }
  await elegirTueste(page, "Medio");
  // B-02: el perfil pedido vive en el panel de perfil de tueste (precargado con el de maquila: se cambia).
  const panelPerfil = page.getByTestId("panel-perfil-tueste");
  await panelPerfil.getByLabel("Temperatura (°C)").fill("205");
  await panelPerfil.getByLabel("Tiempo (min)").fill("12");
  // B-03: cantidad a moler con estimado (220 kg → trilla 19 % → tostión 18 % = 146,1 kg; mitad = 73,1 kg).
  await page.getByRole("radio", { name: "Mitad" }).click();
  await expect(page.getByText("Estimado: 146,1 kg tostados, de los cuales 73,1 kg molidos y 73,0 kg en grano.")).toBeVisible();
  await page.getByRole("button", { name: "Guardar y enviar a planta" }).click();
  const codigo = (await textoDelAviso(page, /Recepción registrada: MQ-/)).match(/MQ-\d{4}-\d+/)?.[0];
  expect(codigo, "el aviso trae el código del lote MQ").toBeTruthy();

  // --- 2. Trilla 220 → 178,2 kg (19 %) --------------------------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByLabel("Entrada: pergamino del lote (kg)")).toHaveValue("220");
  await page.getByLabel("Peso final (kg)").fill("178,2");
  await registrarPaso(page, "Registrar trilla");

  // --- 3. Tostión: el pedido del cliente se ve en los baches y no hay peso de salida (B-05) -------------------------------------
  await abrirPlanta(page, codigo!);
  await expect(page.getByLabel("Kilos a tostar ahora")).toHaveValue("178,2");
  await expect(page.getByText(/Perfil de tueste:.*205,0 °C.*12,0 min/)).toBeVisible();
  await expect(page.getByLabel("Bache 1, temperatura en grados (opcional)")).toHaveValue("205");
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con los kilos a tostar" })).toBeVisible();
  await registrarPaso(page, /Registrar tostión/);

  // --- 4. Molienda: sin pesos ni merma -------------------------------------------------------------------------------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Molienda/ }).click();
  await expect(page.getByText("La molienda no genera merma.")).toBeVisible();
  await registrarPaso(page, "Molienda realizada → Por empacar");

  // --- 5. Empaque: 12 × 10 kg + 5 × 5 kg = 145 kg; báscula 146,1 kg → sobrante 1,1 kg que se entrega a granel -------------------
  await abrirPlanta(page, codigo!);
  await page.getByRole("radio", { name: /^Empaque/ }).click();
  await page.getByLabel("Número de bolsas").first().fill("12");
  await page.getByRole("button", { name: "Agregar bolsas" }).click();
  await page.getByRole("radio", { name: "5 kg" }).nth(1).click();
  await page.getByLabel("Número de bolsas").nth(1).fill("5");
  await page.getByLabel("Peso total en báscula (kg)").fill("146,1");
  await expect(page.getByText("Se entrega a granel.")).toBeVisible();
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
