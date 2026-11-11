# 2. Café: saldo de proceso por kilos (sin bultos) y merma de tostión en empaque

- **Estado:** Aceptada (aprobada por Andrés el 2026-11-11)
- **Fecha:** 2026-11-11
- **Contexto de entrega:** FIN-142 · T-01 del proyecto «Cofradía · Ajustes Fase 1 v2». Bloquea B-01 (FIN-144), B-04 (FIN-150), B-05 (FIN-151), B-07 (FIN-153) y B-08 (FIN-154). Fuente funcional: `docs/cofradia-ajustes-fase1/AJUSTES_COFRADIA_FASE1_v2.md` (§5 y §6).

## Contexto

El procesamiento parcial del vertical café descansa hoy en **bultos**:

- `cafe.lote_bultos` (un lote se compone de n bultos que suman `peso_recibido_kg`, con constraint triggers diferidos `lotes_bultos_cuadran` / `lote_bultos_cuadran`).
- `cafe.proceso_bultos` (qué bultos pasaron por cada proceso; índice único `(bulto_id, tipo)` = un bulto pasa una vez por cada tipo).
- `cafe.paso_previo(lote, tipo, bulto)` y `cafe.peso_disponible(lote, tipo, bultos[])`, que reparten la salida del proceso previo entre bultos (`v_proceso_bultos_peso`).
- `v_bultos_estado`, `v_lote_etapas` (`bultos_total`, `bultos_procesados`, `completo`, `parcial`) y `v_lotes` (`peso_actual_kg`, `estado`, `avance_texto`) derivan de lo anterior.

Las pruebas funcionales con Cofradía cambian el modelo, no solo las pantallas:

- **B-01**: nada de bultos; todo saldo es «X kg por tostar · de Y kg».
- **B-05**: la tostión se registra por **tandas** («kilos a tostar ahora») y **sin peso de salida**.
- **B-08**: el peso de salida de la tostión es el **peso total en báscula del empaque** que cierra la tanda; la merma de tostión se calcula ahí y se asigna a esa tostión.
- **B-04 / B-07**: la trilla registra su peso final; la molienda no pesa ni tiene merma.

Hay que decidir cómo se calcula el saldo sin bultos, cómo se enlaza cada etapa con la anterior y dónde vive la merma de cada tanda, antes de tocar código.

## Decisión

### 1. Saldo por kilos: opción B, sin bultos, con enlace explícito

**Opción B (decidida por Andrés, 2026-11-11).** `lote_bultos` y `proceso_bultos` salen del flujo; el saldo se calcula con los kilos de entrada de los procesos vigentes. Reglas:

1. **Enlace explícito, sin FIFO.** Cada proceso guarda de qué proceso previo consume: `procesos.origen_proceso_id`. En la primera etapa de un lote es `null` y el saldo sale de `lotes.peso_recibido_kg` (sin trilla, el disponible inicial es `peso_recibido_kg`).
2. **Base y saldo.**
   - `base(P)` = `P.peso_salida_kg` si la tiene; si no (tostión antes de su empaque), `P.peso_entrada_kg`.
   - `saldo(P)` = `base(P)` − Σ `peso_entrada_kg` de los procesos **vigentes** (no anulados, sin `reapertura_id`) que tienen a P como `origen_proceso_id`.
   - `saldo(raíz)` = `peso_recibido_kg` − Σ `peso_entrada_kg` de los procesos vigentes con `origen_proceso_id is null`.
3. **Una tanda consume de un solo origen.** Si hay que juntar dos orígenes, se registran dos procesos. Con más de un origen con saldo, el operario elige (no hay elección automática).
4. **Anulación de atrás hacia delante.** Un proceso solo se anula si ningún proceso vigente lo tiene como `origen_proceso_id` (`proceso_con_dependientes`). Anular libera saldo sin borrar filas: el saldo es derivado.
5. **Completo.** Un paso está completo cuando tiene al menos un proceso vigente y su saldo pendiente es ≤ la tolerancia `greatest(0,05 kg; 0,5 % de la base)` (la misma tolerancia de 0,5 % que `peso_supera_disponible` ya usa, para que los lotes de la primera prueba no cambien de estado).
6. **Firmas nuevas.** `paso_previo(lote, tipo)` y `peso_disponible(lote, tipo)`; ninguna recibe bultos. Para reaperturas, `peso_disponible_reapertura(reapertura, tipo)` ya tiene esa forma.
7. **Estado y avance por kg.** `v_lote_etapas` y `v_lotes` se calculan por kg (ver §5).
8. **Retirada expand → contract.** `lote_bultos`, `proceso_bultos`, `v_bultos_estado` y `v_proceso_bultos_peso` quedan **sin escrituras nuevas** (triggers y constraint triggers de cuadre eliminados, `INSERT/UPDATE/DELETE` revocados) y como solo lectura histórica. Se borran en un release posterior (contract). `lotes.num_bultos` pasa a nullable y se oculta.

### 2. Precisiones que este ADR añade al ticket (a confirmar)

Son decisiones de diseño necesarias para que B funcione; se apartan o precisan el texto del ticket:

- **`kg_entrada` es la columna que ya existe: `procesos.peso_entrada_kg`.** No se crea una columna duplicada. Todo lo que el ticket y la v2 llaman `kg_entrada` es `peso_entrada_kg`; sus columnas generadas (`valor`, `merma_*`, `desvio`) no cambian.
- **La molienda no es un eslabón de la cadena de kilos ni consume saldo.** Es una confirmación (B-07). Su `origen_proceso_id` apunta a la **tostión** de la tanda y su `peso_entrada_kg` conserva el «a molienda» estimado (para no romper el `check > 0`); `peso_salida_kg` queda `null`. Razón: el empaque de B-08 tiene **grano y molido en la misma tabla**; si el empaque colgara de la molienda necesitaría dos orígenes y rompería «una tanda = un origen». Por eso **el empaque siempre enlaza a su tostión** (o a la trilla si el lote no lleva tostión), y se descarta la variante «o por la molienda» del ticket. El orden de pasos («primero la molienda, luego el empaque») lo sigue dando `paso_previo`; el origen de kilos lo da la nueva `paso_origen(lote, tipo)`, que se salta la molienda.
- **Procesos que consumen saldo:** trilla, tostión y empaque. **No lo hacen:** molienda y los procesos de reapertura (`reapertura_id is not null`, que siguen fuera del avance del lote como hoy).
- **Tolerancia única** del punto 1.5, implementada en una función SQL (`cafe.saldo_tolerancia_kg(base)`) y su espejo TS, con casos compartidos en Vitest y pgTAP.

### 3. Enlace entre etapas: diseño de columnas y FK

En `cafe.procesos`:

| Columna | Tipo | Regla |
| --- | --- | --- |
| `origen_proceso_id` | `uuid null` | Proceso previo del que consume. `null` = primera etapa (raíz del lote). |
| `origen_tipo` | `cafe.tipo_proceso null` | Denormalizado para la FK compuesta (mismo patrón que `proceso_bultos.tipo`). |

- **FK compuesta por cliente, lote y tipo**: `(tenant_id, origen_proceso_id, origen_tipo, lote_id) → cafe.procesos (tenant_id, id, tipo, lote_id)`. Usa el unique que ya existe (`procesos_ref_uk`), así el origen es del mismo cliente y lote por construcción (la comprobación de una FK salta el RLS). `on delete restrict`.
- **CHECK**: `(origen_proceso_id is null) = (origen_tipo is null)`; y `origen_proceso_id is null` si `reapertura_id is not null`.
- **Coherencia de tipo**: `origen_tipo` debe ser `paso_origen(lote, tipo)`. Va en la RPC (`_insertar_proceso`) y en un trigger `BEFORE INSERT` de respaldo, porque depende de los servicios contratados del lote (un CHECK no puede mirar otra tabla).
- **Índices**: `(origen_proceso_id) where anulado_at is null` (consulta de dependientes y saldo) y, desde B-08, único parcial `(origen_proceso_id) where tipo = 'empaque' and anulado_at is null` (un empaque vigente cierra cada tanda de tostión).
- **Saldo no negativo en concurrencia**: se conserva el `pg_advisory_xact_lock` por lote (hoy lo respalda el índice único de bultos, que desaparece) y se añade un **constraint trigger diferido** `procesos_saldo_ok` que, al insertar o editar un proceso, comprueba `saldo(origen) ≥ −tolerancia`. Solo en inserciones/ediciones nuevas: los procesos históricos pueden traer hasta −0,5 % de sobreentrega.
- **Lectura**: vista `cafe.v_origenes_disponibles` (`security_invoker`): una fila por origen posible de cada lote (cada proceso vigente que consume y la raíz con `proceso_id null`) con `base_kg`, `consumido_kg`, `saldo_kg`, `estimado` (tostión sin salida). Es la fuente única del saldo: `peso_disponible`, `v_lote_etapas`, `v_lotes`, el panel y el formulario de planta la leen; nadie repite la cuenta.

### 4. Peso de salida por tanda y merma de tostión (B-05, B-08)

- **Tostión (B-05)**: `peso_entrada_kg` = «kilos a tostar ahora» (= Σ entradas de sus baches); **no hay salida**. `procesos.peso_salida_kg` pasa a nullable (el `check` sigue siendo `salida ≤ entrada` cuando existe) y `baches.peso_salida_kg` también. `grupo_pesaje` deja de escribirse. `verificar_baches_proceso` compara solo entradas.
- **Empaque (B-08)**: `peso_entrada_kg` del empaque = **peso total en báscula** (en TS/JSON y UI se llama `peso_bascula_kg`; no hay columna duplicada), `peso_salida_kg` = kg en bolsas (Σ líneas) y `diferencia_kg` (ya generada) = **sobrante**. `peso_bascula_kg ≤ peso_entrada_kg` de la tostión (el café tostado no pesa más que el verde) y `bolsas ≤ báscula` (`empaque_supera_peso`, ya existe). El empaque guarda su tanda en `origen_proceso_id` = la tostión.
- **Asignación de la merma a la tostión**: al registrar el empaque, la misma RPC escribe `peso_salida_kg := peso_bascula_kg` en la tostión de origen, **una sola vez**. Las columnas generadas existentes (`merma_kg`, `merma_pct`, `desvio`, `desvio_sentido`) calculan entonces la merma de la tanda con los snapshots (`merma_referencia_pct`, `tolerancia_pts`) que la tostión ya guardó. Así los consumidores (`kpis_periodo`, `costo_libra_lote`, panel de proveedores, remisión, exportación) siguen leyendo la tostión; solo deben **ignorar tostiones sin salida** (tanda en curso).
- **Cómo se escribe sin dar UPDATE a operativos**: `cafe._asignar_salida_tostion(empaque)` es una función `SECURITY DEFINER` mínima, **excepción documentada**: `search_path = ''`, `revoke … from public, anon, authenticated` (solo la llaman las RPC internas), exige `tenant_id = tenant_actual()`, solo escribe si la salida es `null` y solo con el valor del empaque vigente enlazado. Activa la misma bandera de sesión que `editar_lote` (`cafe.edicion_lote`) para pasar el guard `procesos_edicion_directa`. La alternativa (UPDATE para operativos) se descartó por ampliar RLS.
- **Una tanda, un empaque**: el único parcial del punto 3. Como el empaque de marca propia no se anula (`empaque_no_anulable`, se corrige con reapertura o ajuste), la salida de la tostión es de escritura única y estable. Una tostión con empaque tampoco se anula (`proceso_con_dependientes`).
- **Acumulado del lote** (B-08): Σ `peso_entrada_kg` y Σ `peso_salida_kg` de las tostiones vigentes **con salida**, ponderado; vista `cafe.v_tostion_tandas` (tostión, entrada, báscula, merma, `cerrada`).
- **Sobrante (B-09)**: sale de `diferencia_kg` con destino `granel` (marca propia) o `suelto` (terceros). `v_granel_lote` queda como fuente transitoria hasta que B-09 cree `inventario_tostado`. Si el sobrante de una tanda anterior se incluye en un empaque nuevo, ese kilo **no** entra al peso en báscula de la tanda (campo aparte del empaque, definido en B-09), para no alterar su merma.

### 5. Etapas, estado y avance por kg

`v_lote_etapas` (una fila por lote y tipo con proceso vigente) gana, por kg, y pierde el conteo de bultos:

- `kg_base` (lo que el paso puede procesar), `kg_procesados` (Σ `peso_entrada_kg` de sus procesos vigentes), `kg_pendientes = greatest(kg_base − kg_procesados, 0)`.
- `completo` = `kg_pendientes ≤ tolerancia`; `parcial` = `kg_procesados > 0 and not completo`.
- Por tipo: **trilla**, `kg_base = peso_recibido_kg`; **tostión**, `kg_base` = Σ base de sus orígenes (salida de trilla, o `peso_recibido_kg`); **empaque**, `kg_base` = Σ entrada de las tostiones vigentes y `kg_procesados` = Σ entrada de las que ya tienen empaque (misma unidad, kg que entraron a tostión); **molienda**, completa cuando cada tostión que la requiere tiene su molienda vigente (detalle en B-06/B-07).
- `peso_entrada`, `peso_salida`, `merma_kg`, `merma_pct`, `valor`, `desvios`, `ultima_fecha`: igual que hoy, **solo con procesos que tienen salida** (en tostión) y **sin merma en molienda ni empaque** (B-07, B-08).

`v_lotes`: `estado` y `avance_texto` no cambian de forma. `peso_actual_kg` = Σ saldos de lo que sigue en planta; las tostiones sin empaque aportan `entrada × (1 − merma_referencia_pct/100)` y la fila queda marcada `peso_actual_estimado` (en pantalla, «Estimado»). `merma_total_kg/pct` solo se calculan cuando todas las tostiones del lote tienen salida; si no, `null` (y B-17 la retira de la remisión). Las columnas `bultos_total`/`bultos_procesados`/`num_bultos` se devuelven como `null` hasta el contract (una vista no puede perder columnas con `create or replace`).

`kpis_periodo`: «café en planta» y «inventario de terceros» pasan de `v_bultos_estado` a `v_origenes_disponibles` / `peso_actual_kg`. `mermas[]` y `produccion_diaria` excluyen molienda y empaque del cálculo de merma y las tostiones sin salida.

### 6. Trilla, molienda y reapertura

- **Trilla (B-04)**: `peso_salida_kg` = «Peso final (kg)»; `peso_entrada_kg` = kg que entran (≤ saldo de la raíz). Humedad y densidad se guardan en el proceso (columnas `humedad_pct`, `densidad_gl`, definidas en B-04). El **disponible de tostión** de ese origen es el peso final de trilla.
- **Molienda (B-07)**: sin pesos ni merma (punto 2). `confirmado_en/por` los define B-07.
- **Reapertura**: sin origen (`origen_proceso_id null`); su molienda queda sin salida y `peso_disponible_reapertura` ya cae a `r.peso_kg` por el `coalesce`, así que no cambia de comportamiento.

### 7. Compatibilidad multi-tenant

- Las columnas retiradas quedan nullable y ocultas, nunca se borran en el mismo release (expand → contract).
- Las RPC con entrada `jsonb` (`registrar_compra`, `registrar_recepcion`, `registrar_proceso`, `registrar_empaque`) **aceptan e ignoran** `bultos`, `num_bultos` y `pesos_bultos` durante un release, para que una pestaña abierta con la versión anterior no falle. El esquema Zod nuevo ya no los envía.
- `cafe.peso_bulto_kg` deja de sembrarse (función de seed por vertical) y de aparecer en `parametros.ts`; las filas existentes en `public.parametros` se borran en el contract.
- Es una base compartida: ninguna migración de este ADR toca datos de otro cliente; el backfill recorre todos los lotes del vertical café y falla con un listado si algo no cuadra (ver estrategia de migración de datos).

## Lista exacta de lo afectado

### Funciones SQL y triggers (`cafe.*`)

| Objeto (última definición) | Cambio | Ajustes |
| --- | --- | --- |
| `paso_previo(uuid, tipo, uuid)` (`20261104100000`) | Nueva firma `(lote, tipo)`; se elimina la vieja (tiene `default`: un overload sería ambiguo). Sin lógica por bulto. | B-01 |
| `paso_origen(lote, tipo)` | **Nueva**: tipo del origen de kilos (se salta molienda). | B-01 |
| `peso_disponible(uuid, tipo, uuid[])` (`20261104100000`) | Nueva firma `(lote, tipo)`: Σ saldo de los orígenes del `paso_origen`. | B-01 |
| `saldo_proceso(proceso)`, `saldo_tolerancia_kg(base)` | **Nuevas**: saldo de un proceso y tolerancia única. | B-01 |
| `peso_disponible_reapertura` (`20261107110000`) | Sin cambio de firma; se verifica con molienda sin salida. | B-07 |
| `_insertar_proceso` (`20261111100000`, 10 parámetros) | `p_bultos` → `p_origen_proceso_id`; valida origen, saldo y tipo de origen; ya no escribe `proceso_bultos`; tostión sin salida y sin `grupo_pesaje`; molienda sin salida; trilla con peso final. | B-01, B-04, B-05, B-07 |
| `_insertar_proceso_reapertura` (`20261109120000`) | Molienda sin salida ni merma; empaque de reapertura con báscula. | B-07, B-08 |
| `registrar_proceso(jsonb)` (`20261107110000`) | Entrada `origen_proceso_id` en vez de `bultos[]`; acepta e ignora `bultos`. | B-01, B-04, B-05, B-07 |
| `registrar_empaque(jsonb)` (`20261110100000`) | Origen = tostión; báscula; sobrante; llama a `_asignar_salida_tostion`; una tanda un empaque. | B-01, B-08, B-09 |
| `_asignar_salida_tostion(empaque)` | **Nueva**, `SECURITY DEFINER` acotada. | B-08 |
| `anular_proceso` y `procesos_proteger` (`20261107110000`) | Dependientes por `origen_proceso_id`; el resultado devuelve `kg_liberados` en vez de `bultos_liberados`. | B-01 |
| `procesos_liberar_bultos`, `proceso_bultos_proteger`, `proceso_bultos_sin_reapertura` | Triggers eliminados (sin escrituras en `proceso_bultos`). | B-01 |
| `procesos_saldo_ok` (constraint trigger), trigger de coherencia de `origen_tipo` | **Nuevos.** | B-01 |
| `verificar_baches_proceso`, `procesos_verificar_baches`, constraint triggers `procesos_baches_cuadran` / `baches_cuadran` (`20261104100000`) | Comparan solo entradas. | B-05 |
| `registrar_compra` (`20261103100000`), `registrar_recepcion` (`20261108160100`) | Sin `lote_bultos` ni `num_bultos`; peso total directo; aceptan e ignoran claves viejas. | B-01 (con B-02, B-03) |
| `verificar_bultos_lote`, `lotes_verificar_bultos`, constraint triggers `lotes_bultos_cuadran` / `lote_bultos_cuadran`, `lote_bultos_proteger` (`20261102100000`) | Eliminados en el cutover; funciones y tablas se borran en el contract. | B-01 |
| `lotes_proteger` | Deja de comparar `num_bultos`. | B-01 |
| `repartir_peso(total, n)` | Sin uso; se borra en el contract. | B-01 |
| `editar_lote`, `_metricas_edicion`, `procesos_edicion_directa` (`20261118100000`) | La coherencia «lo editado no entra más que lo que entrega el previo» pasa de bultos a `origen_proceso_id`; editar el empaque propaga la báscula a la tostión; editar la salida de una tostión con empaque se rechaza; el peso recibido ya no se cuadra con bultos. | B-16, B-01, B-08 |
| `entregar_lotes`, `generar_remision`, `anular_remision` (`20261114100000`) | Leen `v_lote_etapas.completo` y kg por servicio (`kg_salida`, `merma`): sin merma de molienda/empaque; tostión con la salida de báscula. | B-01, B-07, B-08, B-17 |
| `kpis_periodo` (`20261108100000`), `produccion_diaria` | `v_bultos_estado` → saldos por kg; mermas de tostión solo con salida; sin merma de molienda/empaque. | B-01, B-07, B-08, B-14 |
| `costo_libra_lote`, `costo_libra_panel` (`20261113100000`) | Merma de tostión con tostiones con salida; sin `merma_molienda`. | B-07, B-08, B-13 |
| Función de panel de proveedores (`20261120100000`) | `Σ entrada − Σ salida` solo de tostiones con salida. | B-08, B-14 |
| Función de seed por vertical (`peso_bulto_kg`; última en `20261107100000`) | Deja de sembrar `cafe.peso_bulto_kg`. | B-01 |
| `v_granel_lote` (`20261109120000`) | Transitoria hasta `inventario_tostado`. | B-08, B-09 |

### Vistas

| Vista | Cambio | Ajustes |
| --- | --- | --- |
| `v_origenes_disponibles` | **Nueva** (fuente del saldo). | B-01 |
| `v_tostion_tandas` | **Nueva** (tanda, báscula, merma, cerrada). | B-08 |
| `v_lote_etapas` (`20261107110000`) | Por kg (punto 5). | B-01, B-04, B-05, B-08, B-12 |
| `v_lotes` (`20261114100000`) | `peso_actual_kg` por saldo, `merma_total` condicionada, bultos en `null`. | B-01, B-14, B-17 |
| `v_bultos_estado`, `v_proceso_bultos_peso` | Sin lecturas desde el cutover; se borran en el contract. | B-01 |
| `v_saldo_reabrible`, `v_reaperturas` | Sin cambio (verificar). | B-07 |

### Módulos TypeScript (`src/modules/cafe/…`, `src/app/dashboard/cafe/…`)

| Módulo | Qué cambia | Ajustes |
| --- | --- | --- |
| `compras/{lib/compra.ts, schemas/compra.schema.ts, components/compra-form.tsx, actions/compras.actions.ts}` | Fuera `pesoDesdeBultos`, bultos y peso por bulto; un campo «Peso recibido (kg)». | B-01 |
| `recepciones/{schemas, queries, components/recepcion-form.tsx, actions}` | Igual; luego perfiles y molienda. | B-01, B-02, B-03 |
| `parametros.ts` (`pesoBultoKg`) y sus tests | Se retira el parámetro. | B-01 |
| `lotes/lib/repartir-peso.ts`, `lotes/components/bultos-tabla.tsx` | **Se borran** (con sus tests). | B-01 |
| `lotes/lib/{avance, etapas, donde-esta-hoy, recorrido, linea-tiempo, exportar}.ts` y tests | `textoBultos`, `quedaDisponible`, `bultosPorEstado`, `sinTostar` pasan a kg («202,0 kg por tostar · de 320,0 kg»). | B-01, B-12 |
| `lotes/queries/{lotes, exportar}.queries.ts`, `lotes/types.ts` | Sin `v_bultos_estado`, `proceso_bultos`, `num_bultos`; leen `kg_*`. | B-01, B-08 |
| `lotes/components/{lote-cabecera, donde-esta-hoy, etapas-tabla, avance-barra, lote-timeline, editar-lote*.tsx}` | Texto y datos por kg. | B-01, B-12, B-16 |
| `procesos/lib/pasos.ts` (`BultoPasos`, `evaluarBulto`, `evaluarPaso(s)`, `siguientePaso`, `origenPeso`) | Se reescribe por origen y saldo (espejo TS de `paso_previo`, `paso_origen` y `peso_disponible`). | B-01 |
| `procesos/lib/cola.ts` (`bultosPorEtapa`, `calcularAvisos`) | Por kg; sin avisos en B-19. | B-01, B-19 |
| `procesos/lib/{baches.ts, baches-form.ts}` | Sin salidas ni grupos de pesaje; «Aplicar a los seleccionados». | B-05 |
| `procesos/lib/{resumen.ts, merma.ts}` | Merma de tostión solo desde empaque; trilla con su banda. | B-04, B-05, B-08 |
| `procesos/components/selector-bultos.tsx` | **Se borra.** | B-01 |
| `procesos/components/{proceso-form, tabla-baches, tarjeta-lote, cola-planta, historial-procesos, resumen-merma}.tsx` | Selector de origen/tanda en lugar de bultos; tabla de baches sin salida; historial con kg liberados. | B-01, B-04, B-05, B-07 |
| `procesos/{actions/procesos.actions.ts (consultarPesoDisponible), queries/planta.queries.ts, schemas/proceso.schema.ts, types.ts, types-planta.ts}` | `bultoIds` → `origenProcesoId`; `getPesoDisponible(lote, tipo)`. | B-01, B-05 |
| `empaque/{schemas, types.ts, components/empaque-form.tsx, lib/empaque.ts}` | Tabla fija grano/molido, báscula, sobrante, merma de tanda. | B-08, B-09 |
| `inventario/{queries/inventario.queries.ts, components/bloques-granel.tsx}` | Dejan de leer `v_bultos_estado` y de contar bultos; luego tres bloques. | B-01, B-09, B-10 |
| `remisiones/{lib/entregar.ts (lineaLlegada, numBultos), lib/tiquete.ts, queries}` | Sin bultos; sin merma total. | B-01, B-17 |
| `reapertura/{schemas, components/molienda-reapertura-form.tsx, reapertura-planta.tsx}` | Sin menciones a bultos; molienda sin pesos. | B-01, B-07 |
| `src/app/dashboard/cafe/{recibir, planta/[loteId], lotes/[id]}/page.tsx` | Props y textos. | B-01 |
| `core/rpc/mensajes.ts` | Se retiran `bulto_invalido`, `bulto_ya_procesado`, `bultos_no_cuadran`; se añaden `origen_requerido`, `origen_invalido`, `origen_sin_saldo`, `tanda_con_empaque`, `bascula_supera_entrada`, `salida_asignada_por_empaque`. Se conservan `proceso_con_dependientes` y `peso_supera_disponible`. | B-01, B-05, B-08 |
| `src/lib/supabase/database.types.ts` | `pnpm db:types` en cada migración; sin editar a mano. | todos |

### Pruebas a reescribir

- pgTAP: `94_cafe_procesos`, `98_cafe_lotes`, `96_cafe_compra`, `96_cafe_recepcion`, `88_cafe_reapertura`, `91_cafe_edicion_lotes`, `91_cafe_remisiones`, `92_cafe_remisiones_multilote`, `92_cafe_empaque*`, `93_cafe_lotes_listado`, `94_cafe_merma_dos_lados`, `97_cafe_baches_tiempo_grupo`, `91_cafe_costo_libra`, `87_cafe_kpis`, `87_cafe_panel_proveedores`, `92_cafe_exportacion`, `98_cafe_convertir_presentacion`, `96_cafe_perfil_tueste` y las que usan bultos en `20_auditoria`, `85_tarifas_parametros` y `90_platform`. Nuevas: saldo/orígenes, aislamiento por tenant de `origen_proceso_id`, `procesos_saldo_ok`, anulación de atrás hacia delante, merma por tanda (caso MP-2026-0007: 54,0 → báscula 44,3 = 18,0 %; acumulado 118,0 → 96,7 = 18,1 %).
- Vitest: casos compartidos de saldo y tolerancia SQL/TS.
- E2E (`e2e/cafe/*` y `e2e/helpers/api.ts`, que siembra bultos): reescribir los escenarios de recepción, planta, empaque, entrega, panel, `baches`, `reapertura` y los `qa-escenario-*`.

### Cobertura por ajuste B-01…B-20

| Ajuste | ¿Toca este modelo? | Dónde |
| --- | --- | --- |
| B-01 | Sí, es el corte | saldo, enlace, retirada de bultos, recepción, compra, vistas |
| B-02, B-03 | Parcial | recepción sin bultos (de B-01); perfiles y molienda solicitada son suyos |
| B-04 | Sí | trilla: salida = peso final, base de la tostión |
| B-05 | Sí | tostión por tandas sin salida; baches sin salida |
| B-06 | Parcial | molienda solicitada por tanda (estimado); no consume saldo |
| B-07 | Sí | molienda sin pesos ni merma; reapertura |
| B-08 | Sí | báscula, merma de tanda, empaque por tostión |
| B-09 | Parcial | sobrante desde `diferencia_kg`; `inventario_tostado` es suyo |
| B-10 | Parcial | inventario de verde por saldo |
| B-11, B-15, B-18, B-20 | No | independientes |
| B-12 | Parcial | pasos pendientes leen `v_lote_etapas` por kg |
| B-13 | Parcial | `costo_libra_*` con merma de tanda |
| B-14 | Sí (consumidor) | `kpis_periodo` y proveedores; va al final |
| B-16 | Sí | `editar_lote` por origen y propagación de báscula |
| B-17 | Parcial | remisión sin merma total ni bultos |
| B-19 | Parcial | `calcularAvisos` en `cola.ts` |

## Estrategia de migración de datos (lotes de la primera prueba)

1. **No hay conversión de kilos**: `lotes.peso_recibido_kg` ya es la suma de los bultos y cada proceso ya guarda `peso_entrada_kg` (= su `kg_entrada`). Un lote con bultos > 1 se migra «sumando kg» sin tocar ninguna cifra.
2. **Foto previa**: antes de tocar nada, la migración guarda en una tabla temporal, por lote y por tipo, el `estado`, el `avance_texto`, los kg pendientes por paso (con la lógica de bultos de hoy) y `peso_actual_kg`.
3. **Backfill del enlace** (solo procesos vigentes sin `reapertura_id`): para cada proceso P, su origen es el proceso vigente de tipo `paso_origen(lote, tipo)` al que pertenecen los bultos de P (vía `proceso_bultos`). Sin paso previo → `null`. La molienda se enlaza a la tostión de sus bultos.
   - Si los bultos de un mismo proceso vienen de **más de un** origen, la migración **falla con un listado** (código de lote, proceso, orígenes). No adivina. Se resuelve a mano (anular y registrar de nuevo, o dividir) antes de desplegar; se espera cero casos con los lotes de la prueba.
4. **Validación (en la propia migración y en pgTAP)**: para cada lote, kg pendientes por paso antes y después dentro de la tolerancia; mismo `estado` y mismo `avance_texto`; mismo `peso_actual_kg`. Cualquier diferencia aborta con listado. En pgTAP el caso fijo es el ejemplo del informe (500 kg → 405 → 332 → 330) más un lote parcial con 118,0 de 320,0 kg y uno con dos tandas de tostión.
5. **Pesos de salida de tostión ya medidos**: se conservan tal cual (las tostiones antiguas tienen salida real por bache); las nuevas nacen sin salida. Los empaques antiguos conservan `peso_entrada_kg` = disponible de entonces; coincide con la salida de su tostión, así que el saldo da 0.
6. **`lote_bultos` y `proceso_bultos`**: se quedan como historia de solo lectura; el cutover revoca `INSERT/UPDATE/DELETE` a `authenticated`.
7. **Plan B, solo si la validación del paso 4 falla en lotes que no se pueden corregir y Cofradía lo acepta**: anular esos lotes de prueba y recapturarlos. No se hace sin su visto bueno.

## Esquema de migraciones sugerido

Los nombres llevan el prefijo de fecha que dé `pnpm db:diff` al crearlas. Tras cada una: `pnpm db:types` y commit de migración + `database.types.ts` juntos. Todas con test pgTAP de aislamiento por tenant donde toquen tablas.

1. `<ts>_cafe_saldo_kg_expand.sql` (**B-01, solo expand**). Columnas `origen_proceso_id`/`origen_tipo` + FK compuesta, CHECK, índices; `procesos.peso_salida_kg` y `baches.peso_salida_kg` nullable (checks ajustados); `lotes.num_bultos` nullable; funciones nuevas `saldo_tolerancia_kg`, `paso_origen`, `saldo_proceso`; vista `v_origenes_disponibles`. No cambia ningún comportamiento.
2. `<ts>_cafe_saldo_kg_backfill.sql` (**B-01**). Foto previa, backfill del enlace, validación antes/después (ver estrategia). Falla con listado si no cuadra.
3. `<ts>_cafe_saldo_kg_corte.sql` (**B-01, cutover**). Nuevas `paso_previo(lote, tipo)` y `peso_disponible(lote, tipo)` (se eliminan las viejas); `_insertar_proceso`, `registrar_proceso`, `registrar_empaque`, `anular_proceso`, `procesos_proteger` por origen; `procesos_saldo_ok` y trigger de `origen_tipo`; `registrar_compra`/`registrar_recepcion` sin bultos (aceptan e ignoran claves viejas); `editar_lote` y `_metricas_edicion` por origen; `v_lote_etapas` y `v_lotes` por kg; `kpis_periodo`; `entregar_lotes`; se eliminan constraint triggers y triggers de bultos, `revoke insert, update, delete` sobre las dos tablas; el seed deja de sembrar `cafe.peso_bulto_kg`. TS de B-01 en el mismo PR.
4. `<ts>_cafe_trilla_peso_final.sql` (**B-04**). Columnas de trilla (`humedad_pct`, `densidad_gl`, y las que defina B-04), validación de peso final en `_insertar_proceso`.
5. `<ts>_cafe_tostion_tandas_sin_salida.sql` (**B-05**). `_insertar_proceso` sin salida ni `grupo_pesaje` para tostión; `verificar_baches_proceso` solo entradas; `v_lote_etapas`/`kpis_periodo`/`costo_libra_*`/panel de proveedores ignoran tostiones sin salida. **Debe salir en el mismo release que la 7**: entre ambas, una tostión nueva no tendría dónde recibir su salida.
6. `<ts>_cafe_molienda_confirmacion.sql` (**B-07**, con B-06). Molienda sin salida ni merma, `confirmado_en/por`, ajuste de `peso_disponible_reapertura`, `kpis_periodo`/`produccion_diaria`/`costo_libra_*` sin merma de molienda, remisión sin merma de molienda.
7. `<ts>_cafe_empaque_bascula_merma_tanda.sql` (**B-08**). Único parcial «un empaque vigente por tostión»; `_asignar_salida_tostion`; `registrar_empaque` con báscula, sobrante y tanda; `v_tostion_tandas`; `v_lote_etapas` de empaque por tandas; `_insertar_proceso_reapertura` con báscula; `editar_lote` propaga báscula.
8. `<ts>_cafe_inventario_tostado.sql` (**B-09**, ticket propio). `inventario_tostado`, consumo del sobrante en empaques posteriores, retiro de `v_granel_lote`.
9. **Contract, en un release posterior y solo tras confirmarlo**, `<ts>_cafe_retirar_bultos.sql`: borra `proceso_bultos`, `lote_bultos`, `v_bultos_estado`, `v_proceso_bultos_peso`, `verificar_bultos_lote`, `repartir_peso`, `lotes.num_bultos`, `baches.grupo_pesaje`, las columnas `bultos_*` de las vistas y la fila `cafe.peso_bulto_kg` de `public.parametros`.

## Orden de implementación recomendado

1. **T-01** (este ADR) aprobado.
2. **B-17** (independiente; lo ve el cliente final) y, en paralelo, **B-19** y **B-20** (no dependen del modelo).
3. **B-01**: migraciones 1, 2 y 3 y todo el TS de bultos. Es la base de todo lo demás.
4. **B-18 → B-02 → B-03** (recepción sobre B-01).
5. **B-04** (migración 4): da el peso final que es base de la tostión.
6. **B-05 + B-08 en el mismo release** (migraciones 5 y 7, con 6 si B-06/B-07 van antes): se pueden desarrollar en PR separados sobre `develop`, pero no se promocionan a `main` por separado.
7. **B-06, B-07** (migración 6) y **B-09** (migración 8).
8. **B-10 → B-15 → B-11 → B-12 → B-13 → B-16**. Ojo con B-16: depende de B-01 y B-08 por la propagación de báscula.
9. **B-14** al final: consume todo.
10. **Contract** (migración 9) un release después de que Cofradía confirme.

## Alternativas descartadas

**Opción A: una fila técnica en `lote_bultos` por lote y tandas por `procesos.kg_entrada`.** Cambia menos código a corto plazo, pero conserva la tabla, los constraint triggers de cuadre, el índice único por bulto y la vista `v_proceso_bultos_peso` solo para fingir un bulto único. Cada tanda parcial seguiría chocando con «el bulto ya pasó por este proceso». Se descarta por Andrés: más limpia la B, aunque cueste más migración.

**Reparto FIFO del saldo entre procesos previos.** Evita elegir origen, pero hace que anular un proceso intermedio cambie a qué tanda pertenece cada kilo, y la merma por tanda dejaría de ser trazable. Descartado por Andrés a favor del enlace explícito.

**Empaque enlazado a la molienda.** Obliga a un empaque con dos orígenes (grano y molido en la misma tabla de B-08). Se descarta (punto 2).

**Derivar la salida de la tostión con una vista, sin escribirla.** No exige `SECURITY DEFINER`, pero obliga a cambiar cada consumidor para leer la vista en lugar de `procesos`, y repite la lógica de `desvio`/`desvio_sentido` (ya hecha por las columnas generadas con los snapshots de la propia tostión). Se prefiere escribir la salida una vez, con una función mínima y documentada.

**Un `kg_entrada` nuevo junto a `peso_entrada_kg`.** Dos columnas con el mismo dato que se desincronizan. Se reutiliza la existente.

## Consecuencias

**Positivas**
- Un solo concepto de saldo (`v_origenes_disponibles`), en kilos, que usan planta, ficha, panel e inventario.
- Cada tanda es trazable: de qué trilla sale, qué empaque la cierra y cuál fue su merma.
- Se eliminan la captura de bultos, tres constraint triggers diferidos y el índice único por bulto.
- Los consumidores de merma (panel, costo por libra, remisión, exportación) siguen leyendo las mismas columnas generadas de la tostión.

**Negativas / costes asumidos**
- Es la reescritura más grande del vertical: ~15 funciones SQL, 4 vistas, ~60 ficheros TS y la mayoría de pruebas pgTAP y E2E del vertical.
- Sin el índice único por bulto, la integridad del saldo depende del bloqueo por lote y del constraint trigger `procesos_saldo_ok`.
- Una excepción `SECURITY DEFINER` acotada (`_asignar_salida_tostion`).
- Mientras haya tostiones sin empaque, el «kg en planta» de esas tandas es un **estimado** y se etiqueta así; `merma_total` del lote no existe hasta cerrar todas las tandas.
- B-05 y B-08 quedan acoplados en el release.
- Tolerancia de saldo (0,05 kg o 0,5 %) y reutilización de `peso_entrada_kg` como `kg_entrada` son decisiones de este ADR, no del ticket: Andrés debe confirmarlas.
- Hasta el contract coexisten datos de bultos de solo lectura y columnas ocultas.
