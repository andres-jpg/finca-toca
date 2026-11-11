import { expect, test, usarRol } from "../fixtures/test";
import { clienteComo, dejarStockEn, sqlLocal, stockDe, sufijo } from "../helpers/api";
import { aviso, irA } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA v2 (FIN-163) · escenario 4 «Ajuste»: corregir el −3 de «Consumo 2.500 g» con «Ajustar inventario», motivo «conteo físico»; la
// corrección queda en el kardex, en el registro inmutable de ajustes y en el log de auditoría (quién, cuándo, antes y después). El −3 es el saldo
// negativo que dejó la primera prueba (una venta anterior a B-11): se reproduce con un movimiento directo.

test("v2 · ajuste: el −3 de Consumo 2.500 g se corrige con «conteo físico» y queda en auditoría @tablet", async ({ page }) => {
  const nota = `Conteo ${sufijo()}`;
  dejarStockEn("Consumo 2.500 g", -3);
  expect(await stockDe("Consumo 2.500 g")).toBe(-3);

  // --- 1. El inventario muestra el −3 en el producto -------------------------------------------------------------------------------
  await irA(page, "/dashboard/cafe/inventario");
  const fila = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Consumo 2.500 g", exact: true }) });
  await expect(fila).toContainText(/[-−]3 u/);
  await expect(fila).toContainText("Negativo");

  // --- 2. Ajustar inventario: «Cantidad nueva» 0, motivo «Conteo físico» --------------------------------------------------------------
  await page.getByRole("button", { name: "Ajustar inventario" }).click();
  await page.getByRole("combobox", { name: "Producto" }).click();
  await page.getByRole("option", { name: /^Consumo 2\.500 g/ }).click();
  await expect(page.getByText("Stock actual: −3 u")).toBeVisible();
  await page.getByRole("radio", { name: "Cantidad nueva" }).click();
  await page.getByLabel("Cantidad nueva (unidades)").fill("0");
  await expect(page.getByText("Resultado: −3 → 0 u (+3)")).toBeVisible();
  await page.getByRole("combobox", { name: "Motivo" }).click();
  await page.getByRole("option", { name: "Conteo físico" }).click();
  await page.getByLabel("Observación (opcional)").fill(nota);
  await page.getByRole("button", { name: "Guardar ajuste" }).click();
  await expect(aviso(page, /Ajuste registrado/)).toBeVisible();
  expect(await stockDe("Consumo 2.500 g")).toBe(0);

  // --- 3. Kardex: motivo, antes → después y observación --------------------------------------------------------------------------------
  await page.getByRole("button", { name: "Ver kardex de Consumo 2.500 g" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText(new RegExp(`Conteo físico · [-−]3 → 0 · ${nota}`))).toBeVisible();
  // Quién lo hizo: el usuario queda en la misma fila del kardex.
  await expect(dialogo.getByRole("row").filter({ hasText: nota })).toContainText("admin@cafe.test");

  // --- 4. Auditoría: el registro del ajuste (inmutable) y el log de auditoría con quién y cuándo -------------------------------------------
  const supabase = await clienteComo("cafeAdmin");
  const { data: ajustes, error } = await supabase
    .schema("cafe")
    .from("inventario_ajustes")
    .select("id, tipo, cantidad_antes, cantidad_despues, motivo, observacion, created_by, created_at")
    .eq("observacion", nota);
  expect(error).toBeNull();
  expect(ajustes).toHaveLength(1);
  const ajuste = ajustes![0];
  expect(ajuste).toMatchObject({ tipo: "ajuste", cantidad_antes: -3, cantidad_despues: 0, motivo: "conteo_fisico" });
  expect(ajuste.created_by).toBeTruthy();
  expect(ajuste.created_at).toBeTruthy();

  const traza = sqlLocal(`select count(*) from audit.log where tabla = 'cafe.inventario_ajustes' and registro_id = '${ajuste.id}' and accion = 'INSERT' and user_id is not null;`);
  expect(Number(traza)).toBe(1);
});
