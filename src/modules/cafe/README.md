# cafe — vertical de café

Código del vertical de café. Nace aislado de ganadería y cooperativa: no importa de `@/modules/ganaderia`, `@/modules/cooperativa` ni de `@/features`.

- Puede importar de `@/modules/core`, `@/components` (ui) y `@/lib`.
- Sus tablas viven en el schema `cafe` de Postgres (ver `supabase/migrations/*_schema_cafe.sql`) y se consultan con `supabase.schema("cafe").from(...)`.
- `manifest.ts` declara la navegación del vertical a la plataforma. Cada pantalla de la Fase 1 añade aquí su entrada cuando existe su página (las previstas están comentadas en el propio fichero) con `roles` (membresía, no `rolesLegacy`), más `requireModuloPagina()` en la página y `requireModulo()` en sus actions.

Estructura de cada feature: `<feature>/{actions,components,schemas,lib}`.

`insumos/` son las bolsas y etiquetas de empaque (FIN-104): maestro, compras, ajustes, kardex y alerta de mínimo sobre el inventario del núcleo (ver *Insumos de empaque* en CLAUDE.md).

`lotes/` es el modelo de la trazabilidad (FIN-105): `cafe.lotes` y `cafe.lote_bultos` en `cafe_lotes.sql` (servicios ordenados, bultos que suman el peso del lote, campos bloqueados tras el primer proceso, anulación). Aquí viven los tipos y los helpers puros (`lib/repartir-peso.ts`, `lib/servicios.ts`) y, desde FIN-110, el **listado y la ficha de lotes**: `lib/` (filtros por query string, tipo visible, estado, avance, formato de merma, línea de tiempo), `queries/lotes.queries.ts` (`listarLotes`, `getLote`, `getEtapas`, `getBultos`, `getTimeline`), `components/` (tabla, filtros, pestañas, cabecera, etapas, línea de tiempo, bultos) y la action `anularLote` (ver *Listado y ficha de lotes* en CLAUDE.md). La exportación a Excel (FIN-116) vive en `exportador.ts`, `lib/exportar.ts` y `queries/exportar.queries.ts` (ver *Exportación de lotes y procesos*).

`compras/` es la compra de café para marca propia (FIN-106): la RPC `cafe.registrar_compra` crea el lote `MP-…` con sus bultos y el precio sugerido sale de `cafe.ultimo_precio_compra` (ver *Compra de café marca propia* en CLAUDE.md).

`recepciones/` es la recepción de café de clientes para trilla y/o maquila (FIN-107): RPC `cafe.registrar_recepcion` (lote `MQ-…`, alertas de calidad como snapshot y estimación del valor), formulario de tablet y helpers puros `estimarServicios()` y `evaluarCalidad()` (ver *Recepción de clientes* en CLAUDE.md).

`procesos/` es el modelo de la planta (FIN-108): `cafe.procesos`, `cafe.proceso_bultos` y `cafe.baches` en `cafe_procesos.sql` (merma, valor y desvío generados; tarifa y mermas de referencia como snapshot; proceso parcial por bultos; tostión por baches; anulación que libera los bultos), las funciones `registrar_proceso` / `anular_proceso` / `peso_disponible` / `sugerir_baches` y las vistas `v_lotes` y `v_lote_etapas`, de donde sale el estado y el avance de cada lote (nunca se guardan). Aquí solo viven los tipos y los helpers puros (`lib/merma.ts`, `lib/baches.ts`) con las mismas fórmulas que SQL; la pantalla de planta (FIN-109: cola, formulario de proceso con merma en vivo, baches e historial con anulación) vive también aquí, con `actions/`, `components/`, `queries/`, `schemas/` y más helpers puros (`lib/pasos.ts`, `lib/numero.ts`, `lib/resumen.ts`, `lib/cola.ts`, `lib/baches-form.ts`); ver *Procesos y mermas* y *Pantalla de planta* en CLAUDE.md.

`empaque/` es el empaque de marca propia y el inventario de producto terminado (FIN-111): `cafe.empaque_lineas`, `registrar_empaque` y `registrar_salida_pt` en `cafe_empaque.sql`, el formulario de empaque que monta la planta y la pantalla `/dashboard/cafe/inventario` (matriz tipo × presentación con su kardex). El producto terminado solo aumenta al empacar; ver *Empaque e inventario de producto terminado* en CLAUDE.md.

`reapertura/` es la reapertura de producto empacado de marca propia (FIN-114 · CO-33): `cafe.reaperturas`, `reabrir_producto` y la extensión de `registrar_proceso`/`registrar_empaque` con `reapertura_id` en `cafe_reapertura.sql`, el botón «Reabrir» y la sección «Empacado» de la ficha del lote, y la pantalla `/dashboard/cafe/planta/reapertura/[id]` (moler y/o empacar). **Supuesto:** el producto terminado se lleva por tipo × presentación, no por lote (las ventas no dicen de qué lote sale cada bolsa); por eso el saldo reabrible de un lote es lo empacado de él menos lo ya reabierto de él, y además tiene que haber stock global. Ver *Reapertura de producto empacado* en CLAUDE.md.

`ventas/` son las ventas de marca propia y las cortesías (FIN-112 · CO-31): `cafe.ventas`, `cafe.venta_lineas`, `registrar_venta` y `anular_venta` en `cafe_ventas.sql` (serie `VT`, precio de cada línea como snapshot, salida de inventario que avisa y no bloquea, anulación con devolución), la lista de precios (filas de `public.tarifas` con concepto `cafe.precio_<uuid>`, sección «Precios de venta» de Tarifas y parámetros) y el nº de factura emitida en Aliados (esta app no emite facturas). Ver *Ventas y cortesías* en CLAUDE.md.

`panel/` es el panel operativo de gerencia (FIN-115 · CO-34): `cafe.kpis_periodo`, `produccion_diaria` y `ventas_diarias` en `cafe_kpis.sql` (todas las tarjetas en una llamada, por línea de negocio —marca propia · trilla · maquila, una partición de los lotes— y con «hoy» en la zona del cliente), y la página `/dashboard/cafe` (tarjetas, inventario, tres gráficos de Recharts, resumen por rango y exportación a Excel). **Definiciones de los indicadores** (también el tooltip de cada tarjeta, `panel/lib/kpis.ts`): café recibido = Σ peso recibido de lotes no anulados del periodo, por línea; merma = **ponderada** (Σ merma kg / Σ kg de entrada, por tipo de proceso; nunca un promedio de porcentajes); desvíos = procesos con `desvio`; ingreso marca propia = Σ ventas vigentes (las cortesías no suman); ingreso servicios = Σ valor congelado de los procesos de lotes de servicio; inventario propio y de terceros = foto de ahora (producto terminado y café sin empacar; café de clientes sin remisión de entrega); insumos bajo mínimo. Tabla completa y números de rendimiento en *Panel de gerencia* de CLAUDE.md.

`tipos/` es el catálogo de tipos de café (FIN-102): al crear o activar un tipo, o dar de alta una bolsa, los triggers de `cafe_tipos.sql` generan sus productos terminados (ver *Vertical café* en CLAUDE.md).

## Matriz de permisos por rol (HU-F1-11)

Los roles son los de la membresía (`tenant_members.rol`). En Cofradía: **Administrador** = `owner`/`admin`, **Operativo** = `operativo`, **Gerencia** = `viewer`. Cada tarea de café la aplica en las tres capas: RLS de la tabla (lectura: cualquier miembro; operación `owner|admin|operativo`; maestros y correcciones `owner|admin`, siguiendo la plantilla de *Plantilla RLS para TABLAS NUEVAS* en CLAUDE.md), `requireRolTenant([...])` en cada Server Action y la UI que esconde lo que el rol no puede hacer (cosmético).

| Acción | owner/admin (Administrador) | operativo | viewer (Gerencia) |
| -- | :-: | :-: | :-: |
| Recepciones, compras, procesos, empaque, ventas, movimientos | ✔ | ✔ | ✖ |
| Crear tercero en línea | ✔ | ✔ | ✖ |
| Editar terceros, tipos de café, insumos, tarifas, precios, parámetros | ✔ | ✖ | ✖ |
| Correcciones (anular proceso, ajuste de inventario) | ✔ | ✖ | ✖ |
| Ver todo, dashboard, exportar | ✔ | ✔ | ✔ |
| Gestionar equipo (`core.equipo`) | ✔ (un `admin` no crea ni toca `owner`) | ✖ | ✖ |

Ya aplicada por el núcleo: Terceros (alta `owner|admin|operativo`, edición `owner|admin`), Tarifas y parámetros (`owner|admin`), Inventario (movimientos `owner|admin|operativo`; artículos `owner|admin`; las **correcciones** son movimientos `ajuste`, solo `owner|admin` desde FIN-104) y Equipo (`owner|admin`, ver FIN-103 en CLAUDE.md).
