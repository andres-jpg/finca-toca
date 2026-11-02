import { expect, test, usarRol } from "../fixtures/test";
import { crearRecepcion, registrarTrilla } from "../helpers/api";
import { abrirPlanta, aviso, conComa, elegirTueste, NAVEGACION_LENTA, numeroDelCampo } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA FIN-140 · escenario 2 «Perfil distinto por bache»: lote de terceros de 40,5 kg con perfil pedido de 205 °C. «Aplicar a
// todos» rellena los baches; el bache 3 se pone a 212 °C (queda resaltado) y con una merma alta que avisa en rojo pero NO bloquea.

test("perfil por bache: aplicar a todos, bache 3 a 212 °C resaltado y merma alta sin bloquear @tablet", async ({ page }) => {
  const lote = await crearRecepcion({ servicios: ["trilla", "tostion"], bultos: 1, pesoKg: 40.5, perfilTempC: 205, perfilTiempoMin: 12 });
  await registrarTrilla(lote, 40.5, 32.805);
  await abrirPlanta(page, lote.codigo);

  await page.getByRole("button", { name: "Sugerir baches" }).click();
  await expect(page.getByText(/Pedido del cliente:.*205,0 °C/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Baches (3)" })).toBeVisible();

  const temp = (i: number) => page.getByLabel(`Bache ${i}, temperatura real en grados (opcional)`);
  await page.getByRole("button", { name: "Aplicar a todos los baches" }).click();
  for (const i of [1, 2, 3]) {
    await expect(temp(i)).toHaveValue("205");
    await expect(temp(i)).not.toHaveAttribute("title", /Difiere del pedido/);
  }

  // Bache 3 a 212 °C: difiere del pedido y se resalta (el texto de ayuda lo explica).
  await temp(3).fill("212");
  await expect(temp(3)).toHaveAttribute("title", /Difiere del pedido \(205 °C\)/);
  await expect(temp(1)).not.toHaveAttribute("title", /Difiere/);
  await expect(page.getByText(/resaltado en ámbar difiere del pedido/)).toBeVisible();

  // Salidas: baches 1 y 2 con 18 % de merma y el bache 3 con 30 % (alta).
  for (const [i, pct] of [[1, 18], [2, 18], [3, 30]] as const) {
    const entrada = await numeroDelCampo(page.getByLabel(`Bache ${i}, kg de entrada`, { exact: true }));
    await page.getByLabel(`Bache ${i}, kg de salida`, { exact: true }).fill(conComa(Math.round(entrada * (100 - pct) * 10) / 1000));
  }
  await expect(page.getByText("Revisar · alta").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Cuadra con la entrada" })).toBeVisible();

  // El aviso rojo NO bloquea: la tostión se registra y la app avisa del desvío.
  await elegirTueste(page, "Medio");
  const boton = page.getByRole("button", { name: "Registrar tostión" });
  await expect(boton).toBeEnabled();
  await boton.click();
  await expect(aviso(page, /Tostión registrada/i)).toBeVisible();
  await expect(aviso(page, /merma quedó por encima de la referencia/)).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/cafe\/planta$/, { timeout: NAVEGACION_LENTA });
});
