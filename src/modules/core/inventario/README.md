# inventario — kardex genérico (FIN-96)

Inventario para cualquier vertical: artículos y un log de movimientos. **El stock nunca se guarda ni se edita: es la suma de los movimientos.** Hoy lo usará el vertical de café (insumos de empaque, producto terminado por tipo × presentación); ganadería sigue con `pajillas.cantidad_disponible` (no se migra en Fase 0).

| Pieza | Qué es |
|---|---|
| `public.articulos` | Catálogo por cliente: `tipo`, `unidad`, `atributos` (jsonb, p. ej. `{"clase":"bolsa","presentacion_g":500}`), `stock_minimo` (NULL = sin alerta) y `activo`. Sin DELETE: se desactiva. |
| `public.movimientos_inventario` | Log **append-only** (sin UPDATE ni DELETE para nadie): `cantidad` con signo (+ entrada, − salida), `motivo`, costo, referencia (`ref_tipo`/`ref_id`) y observaciones. |
| `public.v_stock` | Stock actual por artículo + `bajo_minimo` (estricto: `stock < stock_minimo`). |
| `public.v_kardex` | Movimientos con el `saldo` acumulado por artículo. |
| `public.registrar_movimientos(p_movs, p_permitir_negativo)` | **Única vía de escritura de movimientos.** Varios movimientos en una transacción, comprobación de stock. |

## Escribir movimientos

```ts
// Empacar: −bolsa −etiqueta +producto terminado, todo o nada
const r = await registrarMovimientos({
  movimientos: [
    { articulo_id: bolsa, cantidad: -10, motivo: "consumo" },
    { articulo_id: etiqueta, cantidad: -10, motivo: "consumo" },
    { articulo_id: excelso500, cantidad: 10, motivo: "produccion", ref_tipo: "cafe.proceso", ref_id: procesoId },
  ],
});
if (!r.ok) return { error: r.message };           // r.code === "stock_insuficiente", etc.

// Venta: se registra aunque falte stock, y se avisa
const v = await registrarMovimientos({ movimientos: [...], permitirNegativo: true });
if (v.ok && v.data.advertencias.length) { /* stock negativo: avisar */ }
```

- **Nunca `.insert()` directo** sobre `movimientos_inventario` (RLS lo permite a `owner|admin|operativo` solo porque la RPC es `SECURITY INVOKER`): la RPC es lo que serializa por artículo, comprueba el stock y hace atómica la operación.
- Signo y motivo son coherentes (CHECK en la base y en Zod): `saldo_inicial|compra|produccion|devolucion` suman; `consumo|venta|cortesia|muestra|perdida|reapertura` restan; `ajuste` admite ambos pero **exige observación**. Corregir un error = otro movimiento `ajuste`.
- Una salida que deja el stock de un artículo bajo cero falla con `stock_insuficiente` (no queda nada escrito), salvo `permitirNegativo`.
- Un artículo desactivado no admite movimientos (`articulo_inactivo`).

## Contenido

| Carpeta | |
|---|---|
| `actions/inventario.actions.ts` | `crearArticulo`, `actualizarArticulo`, `desactivarArticulo`, `reactivarArticulo`, `registrarMovimientos`. Devuelven `Result<T>`. Catálogo: `owner|admin`; movimientos: `owner|admin|operativo` (rol de membresía vía `rol_en_tenant()`). |
| `queries/inventario.queries.ts` | `getStock({ tipo?, soloBajoMinimo?, incluirInactivos? })` y `getKardex(articuloId, rango)`; paginan con `.range()` (tope de 1000 de PostgREST). |
| `schemas/` | Zod: artículos, movimiento (formato RPC, cantidad con signo) y `movimientoFormSchema` (cantidad positiva + motivo/dirección → `aMovimiento()`). |
| `lib/inventario.ts` | Puro: enums, `signoMotivo`, `estadoStock`, `etiquetaArticulo(atributos)` → "Excelso · 500 g". |
| `components/` | `StockBadge` (verde / ámbar bajo mínimo / rojo negativo), `KardexTable`, `MovimientoForm`, `AlertaStockBajo`. |

No tiene página propia en Fase 0: la pondrá el vertical de café en Fase 1.

## Pendiente

- `lib/cliente.ts` tipa a mano `articulos`/`v_stock`/`v_kardex` mientras `database.types.ts` no los incluya. Tras `pnpm db:types`, borrarlo y usar `createClient()`.
- `lib/autorizar.ts` lee el rol de `rol_en_tenant()`; sustituirlo por el guard del núcleo cuando la tarea de sesión (FIN-91) lo publique.
- Fuera de alcance: migrar `pajillas` al kardex y costeo promedio ponderado (`costo_unitario` solo se guarda).
