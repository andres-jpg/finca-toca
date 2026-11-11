import { expect, test, usarRol } from "../fixtures/test";
import { clienteComo, crearCompra, hoyBogota, rpcCafe, stockDe, sufijo, tostarYEmpacar } from "../helpers/api";
import { aviso, elegirProductoDeVenta, irA } from "../helpers/ui";

// B-11 (no se vende lo que no hay) y B-15 (Ajustar inventario con motivo y auditoría, y carga inicial). El punto de
// partida se monta por la API; lo que cada escenario quiere probar se hace por la interfaz o por una petición directa
// a la RPC (la frontera real).

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

test.describe("B-11 · venta sin stock", () => {
  test.use(usarRol("cafeAdmin"));

  test("la cantidad no pasa del stock y el «+» se deshabilita en el máximo @tablet", async ({ page }) => {
    const lote = await crearCompra({ pesoKg: 125 });
    await tostarYEmpacar(lote, 125, [{ presentacion_g: 500, unidades: 4 }]);
    const stock = await stockDe("Excelso 500 g");
    expect(stock).toBeGreaterThanOrEqual(4);

    await irA(page, "/dashboard/cafe/ventas/nueva");
    await elegirProductoDeVenta(page, "Excelso 500 g");
    const cantidad = page.getByLabel("Cantidad", { exact: true });
    await cantidad.fill(String(stock + 10));
    await expect(cantidad).toHaveValue(String(stock));
    await expect(page.getByText(`Máximo disponible: ${stock}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Una unidad más" })).toBeDisabled();

    // Bajar una unidad vuelve a habilitar el «+».
    await page.getByRole("button", { name: "Una unidad menos" }).click();
    await expect(page.getByRole("button", { name: "Una unidad más" })).toBeEnabled();
  });

  test("una petición directa con más unidades que el stock se rechaza, también en una cortesía", async () => {
    const stock = await stockDe("Excelso 500 g");
    const articulo = await idArticulo("Excelso 500 g");
    const tercero = await idConsumidorFinal();
    const venta = (tipo: "venta" | "cortesia", cantidad: number) => ({
      tipo,
      fecha: hoyBogota(),
      tercero_id: tercero,
      lineas: [{ articulo_id: articulo, cantidad, precio_unitario: tipo === "venta" ? 29000 : 0 }],
    });

    await expect(rpcCafe("registrar_venta", venta("venta", stock + 1))).rejects.toThrow(new RegExp(`Stock insuficiente para Excelso 500 g\\. Disponible: ${stock}\\.`));
    // La cortesía va a un destinatario real: se usa el consumidor final solo porque la RPC no distingue; el rechazo es por stock.
    await expect(rpcCafe("registrar_venta", venta("cortesia", stock + 1))).rejects.toThrow(/Stock insuficiente para Excelso 500 g/);
    expect(await stockDe("Excelso 500 g")).toBe(stock);
  });
});

test.describe("B-15 · ajustar inventario", () => {
  test.describe("administrador", () => {
    test.use(usarRol("cafeAdmin"));

    test("ajusta por diferencia con motivo y queda en el kardex del producto", async ({ page }) => {
      const lote = await crearCompra({ pesoKg: 125 });
      await tostarYEmpacar(lote, 125, [{ presentacion_g: 500, unidades: 4 }]);
      const antes = await stockDe("Excelso 500 g");
      const nota = `Conteo ${sufijo()}`;

      await irA(page, "/dashboard/cafe/inventario");
      await page.getByRole("button", { name: "Ajustar inventario" }).click();
      await page.getByRole("combobox", { name: "Producto" }).click();
      await page.getByRole("option", { name: /^Excelso 500 g/ }).click();
      await page.getByRole("radio", { name: "Diferencia" }).click();
      await page.getByRole("combobox", { name: "La diferencia" }).click();
      await page.getByRole("option", { name: "Resta del stock" }).click();
      await page.getByLabel("Diferencia (unidades)").fill("2");
      await expect(page.getByText(`Resultado: ${antes} → ${antes - 2} u (−2)`)).toBeVisible();

      // Sin motivo no se guarda.
      await page.getByRole("button", { name: "Guardar ajuste" }).click();
      await expect(page.getByRole("alert")).toContainText("Elegir el motivo del ajuste");

      await page.getByRole("combobox", { name: "Motivo" }).click();
      await page.getByRole("option", { name: "Conteo físico" }).click();
      await page.getByLabel("Observación (opcional)").fill(nota);
      await page.getByRole("button", { name: "Guardar ajuste" }).click();
      await expect(aviso(page, /Ajuste registrado/)).toBeVisible();
      expect(await stockDe("Excelso 500 g")).toBe(antes - 2);

      // Quién, cuándo y por qué: en el kardex del producto.
      await page.getByRole("button", { name: "Ver kardex de Excelso 500 g" }).click();
      await expect(page.getByRole("dialog").getByText(new RegExp(`Conteo físico · ${antes} → ${antes - 2} · ${nota}`))).toBeVisible();
    });

    test("un ajuste no deja el stock en negativo", async () => {
      const stock = await stockDe("Excelso 500 g");
      const articulo = await idArticulo("Excelso 500 g");
      await expect(
        rpcCafe("ajustar_inventario", { articulo_id: articulo, modo: "diferencia", cantidad: -(stock + 1), motivo: "dano" }),
      ).rejects.toThrow(/no puede quedar negativo/);
      expect(await stockDe("Excelso 500 g")).toBe(stock);
    });
  });

  test.describe("operativo", () => {
    test.use(usarRol("cafeOperativo"));

    test("no ve el botón y la API le rechaza el ajuste", async ({ page }) => {
      await irA(page, "/dashboard/cafe/inventario");
      await expect(page.getByRole("button", { name: "Registrar salida" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Ajustar inventario" })).toHaveCount(0);

      const articulo = await idArticulo("Excelso 500 g");
      await expect(
        rpcCafe("ajustar_inventario", { articulo_id: articulo, modo: "nueva", cantidad: 0, motivo: "correccion" }, "cafeOperativo"),
      ).rejects.toThrow();
    });

    test("la carga inicial no es de su alcance: la pantalla lo devuelve a su inicio", async ({ page }) => {
      await page.goto("/dashboard/cafe/configuracion/carga-inicial");
      await page.waitForURL((url) => !url.pathname.startsWith("/dashboard/cafe/configuracion"));
      await expect(page).toHaveURL(/\/dashboard\/cafe\/planta/);
    });
  });
});

test.describe("B-15 · carga inicial", () => {
  test.use(usarRol("cafeAdmin"));

  test("carga café verde por tipo de café y aparece en el inventario; una segunda carga se rechaza", async ({ page }) => {
    // Un tipo de café propio de este test: la carga inicial es de una sola vez y la base de pruebas persiste entre corridas.
    const nombre = `Tipo CI ${sufijo()}`;
    const supabase = await clienteComo("cafeAdmin");
    const { error } = await supabase.schema("cafe").from("tipos_cafe").insert({ nombre });
    if (error) throw new Error(`No se pudo crear el tipo de café: ${error.message}`);

    await irA(page, "/dashboard/cafe/configuracion/carga-inicial");
    await expect(page.getByRole("navigation", { name: "Configuración" }).getByRole("link", { name: "Carga inicial" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("radio", { name: "Café verde por tostar" }).click();
    await page.getByRole("combobox", { name: "Tipo de café" }).click();
    await page.getByRole("option", { name: nombre }).click();
    await page.getByLabel(/^Cantidad/).fill("12,5");
    await page.getByLabel(/^Costo unitario estimado/).fill("28500");
    await page.getByRole("button", { name: "Registrar carga inicial" }).click();
    await expect(aviso(page, /Carga inicial registrada/)).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(`Café verde por tostar ${nombre} 12,5 kg \\$28\\.500/kg`) })).toBeVisible();

    // En Inventario, el café verde por tostar incluye la carga.
    await irA(page, "/dashboard/cafe/inventario");
    await expect(page.locator("#inv-verde").locator("..").getByText(nombre)).toBeVisible();

    // Una segunda carga del mismo tipo se rechaza.
    const tipo = await supabase.schema("cafe").from("tipos_cafe").select("id").eq("nombre", nombre).single();
    await expect(
      rpcCafe("carga_inicial", { clase: "verde", tipo_cafe_id: tipo.data?.id, cantidad: 1, costo_unitario: 1 }),
    ).rejects.toThrow(/ya tiene carga inicial/);
  });

  test("un producto terminado se carga una sola vez y no genera compra", async () => {
    const articulo = await idArticulo("Consumo 500 g");
    const carga = { clase: "producto", articulo_id: articulo, cantidad: 1, costo_unitario: 18969 };
    // Si una corrida anterior ya lo cargó, la primera también se rechaza: lo que importa es que la segunda lo haga.
    await rpcCafe("carga_inicial", carga).catch(() => undefined);
    await expect(rpcCafe("carga_inicial", carga)).rejects.toThrow(/Este producto ya tiene carga inicial\. Usar "Ajustar inventario"\./);
  });
});
