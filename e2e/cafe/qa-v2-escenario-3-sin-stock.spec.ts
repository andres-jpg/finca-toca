import { expect, test, usarRol } from "../fixtures/test";
import { clienteComo, crearMolidoEmpacado, dejarStockEn, hoyBogota, rpcCafe, stockDe } from "../helpers/api";
import { elegirProductoDeVenta, irA } from "../helpers/ui";

test.use(usarRol("cafeAdmin"));

// QA v2 (FIN-163) · escenario 3 «Sin stock»: vender «Consumo 2.500 g» (grano) en cero queda bloqueado; llevar «Excelso 2.500 g molido»
// al máximo deshabilita el «+»; una petición directa a la API se rechaza. La base se comparte: antes de empezar, «Consumo 2.500 g»
// se deja en cero (otro escenario lo corrige desde −3) y se asegura que haya molido de 2.500 g.

async function idArticulo(nombre: string): Promise<string> {
  const supabase = await clienteComo("cafeAdmin");
  const { data, error } = await supabase.from("v_stock").select("articulo_id").eq("nombre", nombre).single();
  if (error) throw new Error(`Artículo «${nombre}» no encontrado: ${error.message}`);
  return data.articulo_id as string;
}

async function idConsumidorFinal(): Promise<string> {
  const supabase = await clienteComo("cafeAdmin");
  const { data, error } = await supabase.from("terceros").select("id").eq("es_consumidor_final", true).single();
  if (error) throw new Error(`Consumidor final no encontrado: ${error.message}`);
  return data.id as string;
}

test("v2 · sin stock: bloqueo en cero, «+» deshabilitado en el máximo y la API lo rechaza @tablet", async ({ page }) => {
  dejarStockEn("Consumo 2.500 g", 0);
  await crearMolidoEmpacado(2500, 4);
  const stockMolido = await stockDe("Excelso 2.500 g molido");
  expect(stockMolido).toBeGreaterThanOrEqual(4);

  await irA(page, "/dashboard/cafe/ventas/nueva");

  // --- 1. Consumo 2.500 g en grano, en cero: la tarjeta está bloqueada y dice «Agotado» --------------------------------------------
  const consumo = page.getByRole("button", { name: "Agregar Consumo 2.500 g", exact: true });
  await expect(consumo).toBeDisabled();
  await expect(consumo).toContainText("Agotado");
  await consumo.click({ force: true });
  await expect(page.getByRole("group", { name: "Unidades de Consumo 2.500 g" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Guardar venta" })).toBeDisabled();

  // --- 2. Excelso 2.500 g molido: se lleva al máximo y el «+» se deshabilita -------------------------------------------------------
  await elegirProductoDeVenta(page, "Excelso 2.500 g molido");
  const cantidad = page.getByLabel("Cantidad", { exact: true });
  await cantidad.fill(String(stockMolido + 5));
  await expect(cantidad).toHaveValue(String(stockMolido));
  await expect(page.getByText(`Máximo disponible: ${stockMolido}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Una unidad más" })).toBeDisabled();
  await page.getByRole("button", { name: "Una unidad menos" }).click();
  await expect(page.getByRole("button", { name: "Una unidad más" })).toBeEnabled();
  await page.getByRole("button", { name: "Una unidad más" }).click();
  await expect(page.getByRole("button", { name: "Una unidad más" })).toBeDisabled();

  // --- 3. Petición directa a la API: rechazada (la frontera real es la base) ------------------------------------------------------
  const tercero = await idConsumidorFinal();
  const venta = (tipo: "venta" | "cortesia", articulo: string, cantidadU: number) => ({
    tipo,
    fecha: hoyBogota(),
    tercero_id: tercero,
    lineas: [{ articulo_id: articulo, cantidad: cantidadU, precio_unitario: tipo === "venta" ? 115000 : 0 }],
  });
  const idConsumo = await idArticulo("Consumo 2.500 g");
  const idMolido = await idArticulo("Excelso 2.500 g molido");
  await expect(rpcCafe("registrar_venta", venta("venta", idConsumo, 1))).rejects.toThrow(/Stock insuficiente para Consumo 2\.500 g\. Disponible: 0\./);
  await expect(rpcCafe("registrar_venta", venta("cortesia", idConsumo, 1))).rejects.toThrow(/Stock insuficiente para Consumo 2\.500 g/);
  await expect(rpcCafe("registrar_venta", venta("venta", idMolido, stockMolido + 1))).rejects.toThrow(
    new RegExp(`Stock insuficiente para Excelso 2\\.500 g molido\\. Disponible: ${stockMolido}\\.`),
  );
  // Nada se movió.
  expect(await stockDe("Consumo 2.500 g")).toBe(0);
  expect(await stockDe("Excelso 2.500 g molido")).toBe(stockMolido);
});
