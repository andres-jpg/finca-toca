import { expect, test, usarRol } from "../fixtures/test";
import { crearRecepcion, registrarTrilla } from "../helpers/api";
import { abrirPlanta, aviso, elegirTueste, NAVEGACION_LENTA } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA FIN-140 · escenario 2 «Perfil distinto por bache» (B-05): lote de terceros de 40,5 kg con perfil pedido de 205 °C · 12 min. Los
// baches nacen con ese perfil; el bache 3 se pone a 212 °C (queda resaltado) y la tostión se registra SIN peso de salida: la merma
// de la tanda sale al empacar con el peso en báscula (aquí alta: avisa en rojo pero NO bloquea).

test("perfil por bache: baches con el perfil, bache 3 a 212 °C resaltado y merma alta al empacar sin bloquear @tablet", async ({ page }) => {
  const lote = await crearRecepcion({ servicios: ["trilla", "tostion"], pesoKg: 40.5, perfilTempC: 205, perfilTiempoMin: 12 });
  await registrarTrilla(lote, 40.5, 32.805);
  await abrirPlanta(page, lote.codigo);

  await expect(page.getByLabel("Kilos a tostar ahora")).toHaveValue("32,805");
  await expect(page.getByRole("heading", { name: "Baches (3)" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Sale|Salida/ })).toHaveCount(0);

  const temp = (i: number) => page.getByLabel(`Bache ${i}, temperatura en grados (opcional)`);
  for (const i of [1, 2, 3]) {
    await expect(temp(i)).toHaveValue("205");
    await expect(temp(i)).not.toHaveAttribute("title", /Difiere del perfil/);
  }

  // Bache 3 a 212 °C: difiere del perfil y se resalta.
  await temp(3).fill("212");
  await expect(temp(3)).toHaveAttribute("title", /Difiere del perfil \(205 °C\)/);
  await expect(temp(1)).not.toHaveAttribute("title", /Difiere/);
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con los kilos a tostar" })).toBeVisible();

  await elegirTueste(page, "Medio");
  await page.getByRole("button", { name: /Registrar tostión/ }).first().click();
  await expect(aviso(page, /Tostión registrada/i)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/planta$/, { timeout: NAVEGACION_LENTA });

  // Empaque con una báscula que deja una merma del 30 %: «Revisar · alta» pero se puede guardar.
  await abrirPlanta(page, lote.codigo);
  await page.getByRole("radio", { name: /^Empaque/ }).click();
  await page.getByRole("radio", { name: "Otro (kg)" }).click();
  await page.getByLabel("Peso por bolsa en kilos").fill("1");
  await page.getByLabel("Número de bolsas").fill("22");
  await page.getByLabel("Peso total en báscula (kg)").fill("22,9");
  await expect(page.getByText("Revisar · alta").first()).toBeVisible();
  const boton = page.getByRole("button", { name: "Registrar empaque" });
  await expect(boton).toBeEnabled();
  await boton.click();
  await expect(aviso(page, /Empaque registrado/)).toBeVisible();
});
