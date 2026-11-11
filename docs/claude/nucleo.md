# Núcleo: auditoría, arquitectura modular, RPC transaccionales, inventario, consecutivos, terceros, tarifas, Excel e impresión

> Detalle movido desde CLAUDE.md. Léelo antes de tocar esta área.

### Auditoría

Todo cambio en las tablas de negocio queda en `audit.log` (migración `20261026120000_auditoria.sql`, FIN-88): tabla, `registro_id`, acción (`INSERT`/`UPDATE`/`DELETE`), `antes`/`despues` completos, `cambios` (solo las claves modificadas de un UPDATE, con su valor nuevo), `user_id` (`auth.uid()`) y `at`. Lo escribe un trigger genérico, `audit.registrar_cambio()` (`SECURITY DEFINER`, `search_path = ''`); el código de la app **no** registra nada ni pasa el usuario. Un UPDATE sin cambios reales —o que solo toca `updated_at`/`updated_by`— no genera fila.
- **Qué está auditado**: `precios`, `gastos`, `ingresos`, `eventos_animal`, `animales`, `pajillas`, `arriendos`, `arriendos_abonos`, `fincas_cooperativa`, `pagos_finca`, `roles`, `tenants`, `tenant_modulos`, `tenant_members`, `series_consecutivo`, `articulos`, `terceros`, `tarifas`, `parametros`, `tipos_cafe`, `lotes`, `lote_bultos`. **No** `recolecciones` ni `extracciones_leche` (alto volumen diario, no aporta), ni `consecutivos` (cambia en cada documento), ni el resto de tablas de catálogo (`conceptos_*`, `subconceptos_*`, `itinerarios*`, `rutas*`, `pagos`…). Para sumar una: `select audit.activar('public.<tabla>');` en una migración nueva (la tabla necesita columna `id`).
- **Tenant del log**: sale de `tenant_id` de la fila (`to_jsonb`); `audit.activar('public.tenants', 'id')` pasa otra columna cuando la fila es el propio cliente. `fincas_cooperativa` y `pagos_finca` no tienen `tenant_id` (son de la cooperativa) y `roles.tenant_id` es NULL en los roles de cooperativa: esas filas se registran con `tenant_id` NULL y **ningún usuario las ve por RLS** (solo postgres/service role, hasta que se decida quién audita la cooperativa).
- **Lectura**: RLS de `audit.log` → SELECT solo con `rol_en_tenant() in ('owner','admin')` y `tenant_id = tenant_actual()` (FIN-90; antes `rol_actual() = 'admin'`); nadie tiene INSERT/UPDATE/DELETE. El esquema `audit` **no** está en `[api] schemas` ni en `db:types`: la app lee con la RPC `public.historial_cambios(p_tabla, p_registro_id, p_limite)` (`SECURITY DEFINER`, solo `authenticated`; revalida owner/admin+tenant porque salta RLS y devuelve el email solo de miembros del mismo cliente, vía `tenant_members`). Los emails nunca salen de otro cliente. En `src/modules/core/auditoria/` están `getHistorialCambios()` (owner/admin de la membresía, `requireRolTenant`) y el componente `HistorialCambios` (con `etiquetaRegistro` y `resumir` opcionales para personalizar el texto); lo usa la pantalla de *Equipo* (`public.tenant_members`).
- **`user_id` NULL**: el cron (service role), el seed y cualquier escritura sin sesión (SQL editor) dejan `user_id` NULL; el componente los muestra como «Sistema». `audit.log.user_id` no tiene FK a propósito: el log sobrevive al borrado del usuario.
- **Retención**: no se purga nada en Fase 0 (volumen bajo). Revisarlo antes de auditar tablas de alto volumen.
- **Aviso del linter**: `historial_cambios()` es `SECURITY DEFINER` ejecutable por `authenticated`, igual que `tenant_actual()`/`rol_actual()` (ver *Multi-tenancy*): es inevitable y esperado. `registrar_cambio()`, `activar()` y `set_updated()` no son ejecutables por `anon`/`authenticated`.

**Convención para TABLAS NUEVAS** (en cualquier esquema; las del núcleo y del vertical de café nacen así):

```sql
created_at timestamptz not null default now(),
created_by uuid default auth.uid() references auth.users,
updated_at timestamptz,
updated_by uuid references auth.users,
-- y tras crearla:
create trigger set_updated before update on esquema.tabla
  for each row execute function public.set_updated();   -- rellena updated_at = now(), updated_by = auth.uid()
select audit.activar('esquema.tabla');
```

Las tablas **existentes** no llevan `updated_at`/`updated_by` (salvo `pagos_finca.updated_at`, que ya estaba): no se añadieron porque el log ya guarda quién y cuándo, y así la migración no toca ninguna fila. `set_updated()` asigna ambas columnas, así que no se puede enganchar a una tabla que no las tenga. El test pgTAP de una tabla nueva debería comprobar que sus INSERT/UPDATE/DELETE dejan fila en `audit.log` (ver `supabase/tests/20_auditoria.test.sql`, que filtra por registro porque el seed ya genera filas de log).

### Arquitectura modular

La app evoluciona a un **monolito modular** multi-vertical. El esqueleto vive en `src/modules/` (FIN-86); las features existentes **siguen en `src/features/`** y se migran en la Fase 2.

```
src/modules/
├── core/          # núcleo de plataforma (auth, rpc, auditoria, tenants, registry, consecutivos, inventario, terceros, tarifas, parametros, export, print, platform): nada que conozca vacas ni café
├── registry.ts    # agregador de manifiestos: getNavParaSesion() (el ÚNICO fichero que ve todos los verticales)
├── cafe/          # vertical de café (manifest.ts con nav vacío hasta la Fase 1; parametros.ts con sus parámetros y conceptos de tarifa)
├── ganaderia/     # manifest.ts; el código sigue en src/features hasta la Fase 2
└── cooperativa/   # manifest.ts; el código sigue en src/features hasta la Fase 2
```

Cada submódulo sigue el patrón actual: `<feature>/{actions,components,queries,schemas,lib}` (según lo que necesite). Los verticales y algunos submódulos de `core` (auditoría, inventario, terceros) llevan un `README.md` que explica qué va dentro.

**Reglas de dependencia** (`eslint-plugin-boundaries`, configuradas en `eslint.config.mjs` y aplicadas **solo a `src/modules/**`**; el resto del código no se ve afectado). Elementos: `core`, `vertical` (`cafe|ganaderia|cooperativa`, captura el nombre), `legacy-feature` (`src/features/**`), `ui` (`src/components/**`), `lib` (`src/lib/**`), `app` (`src/app/**`), más la categoría de fichero `registry` (`src/modules/registry.ts`, vía `boundaries/files`).
- Permitido: `vertical` → `core`, `ui`, `lib` y **el mismo** vertical; `core` → `ui`, `lib`; `app` → todo; `registry.ts` → `core`, **todos** los `vertical`, `ui`, `lib` (es la única excepción a «vertical → vertical», y está acotada a ese fichero).
- Prohibido: `vertical` → otro `vertical`; `core` → cualquier `vertical`; `src/modules/*` → `src/features/**`; `core`/`vertical` → `registry.ts` (crearía un ciclo con los manifiestos). Lo que dos verticales necesiten en común sube a `core`.
- `pnpm lint` falla (error, no aviso) ante una violación. Un import `@/modules/...` desde `src/app` o `src/features` no está restringido.

**Registro de módulos y barra lateral (FIN-92)**: cada módulo declara su navegación en un manifiesto y la barra lateral se construye con los de los módulos activos del cliente y el rol del usuario. No hay lista de rutas en `sidebar.tsx`.
- `core/registry/types.ts` define `NavItemDef` (`href`, `label`, `icon` como **nombre** de icono, `modulo: ModuloId`, `roles` (membresía, para módulos nuevos) y/o `rolesLegacy` (tabla `roles`, para las pantallas existentes; toda entrada declara al menos uno), `grupo?`, `hideInPWA?`, `orden`) y `ModuleManifest = { vertical: Vertical | 'core'; nav }`. Manifiestos: `ganaderia/manifest.ts` y `cooperativa/manifest.ts` (las entradas de siempre, tal cual), `cafe/manifest.ts` (Lotes, Panel y Tipos de café; ver *Vertical café*) y `core/manifest.ts` (Terceros, Tarifas y parámetros y Equipo: **invisibles mientras el cliente no tenga `core.terceros` / `core.equipo`**; los de café los reciben al alta).
- `getNavParaSesion(sesion, { pwa? })` (`src/modules/registry.ts`) es **pura**: filtra por vertical del cliente (o `core`), módulo activo, rol (`roles` contra `rolTenant`; `rolesLegacy` contra `rolLegacy`; si hay ambos, deben cumplirse los dos) y PWA, y ordena por grupo (`ORDEN_GRUPOS`; sin grupo primero) y `orden`. La lógica vive en `core/registry/nav.ts` (`construirNav`), que no conoce ningún vertical; `registry.ts` solo le pasa la lista de manifiestos. El layout del dashboard la llama en el servidor y pasa los items a `Sidebar`, que solo los pinta: el mapa nombre → componente está en `components/layout/icon-map.tsx` (cliente) y exige una entrada por cada nombre de `ICONOS_NAV`. Lo único que decide el cliente es la PWA (`ocultoEnPWA()`: oculta `hideInPWA` solo a `cooperativa_user`; el admin de la cooperativa sigue viendo Itinerarios).
- **Para añadir una pantalla nueva: entrada en el manifiesto de su módulo + `requireModuloPagina(modulo)` en su `page.tsx`/`layout.tsx` + `requireModulo(modulo)` en sus Server Actions.** Las tres piezas hacen falta: la entrada solo esconde la opción (cosmético), la página redirige a `/dashboard` y cada action lanza `AuthorizationError`. Para un módulo nuevo del catálogo: fila en `public.modulos` + id en `MODULOS` (ver *Módulos por cliente*). Un vertical nuevo añade su manifiesto a `MANIFIESTOS` en `registry.ts`.
- **Páginas de inicio**: `paginaInicial(sesion)` (`core/registry/pagina-inicial.ts`) es la fuente de a dónde se manda a quien no tiene acceso a lo que pidió: por rol legacy (`PAGINA_INICIAL_POR_ROL`, lo que antes era `ROLE_HOME`) y, sin rol legacy, por vertical (`PAGINA_INICIAL_POR_VERTICAL`: ganadería → `/dashboard/extracciones`, cooperativa → `/dashboard/cooperativa`; café → `/dashboard/cafe/lotes`, para todos los roles). `checkRoutePermission()` y `/dashboard` la usan.
- Un cliente al que se le quita un módulo base pierde sus entradas del menú (antes solo Arriendos dependía de `tenant_modulos`); las páginas legacy de esas entradas siguen protegidas solo por `checkRoutePermission()` hasta que se les añada `requireModuloPagina()` (hoy solo lo llevan Arriendos, Terceros y Tarifas). Los tests `src/modules/registry.test.ts` fijan el menú de cada usuario del seed (`registry.baseline.ts`): si cambia, cambia el menú de alguien.

**Nada de `if (tenant === ...)`**: lo que cambia entre clientes es **configuración** (manifiesto de módulos, datos), no ramas en el código.

**Schema `cafe`** (migración `20261025120000_schema_cafe.sql`): nace vacío y alberga las tablas del vertical de café. Solo `authenticated` y `service_role` tienen `USAGE` (`anon` no), y las tablas/secuencias/funciones futuras heredan sus privilegios por defecto. Se consulta con el mismo cliente: `supabase.schema("cafe").from(...)` / `.rpc(...)` (ver comentario en `lib/supabase/server.ts`), sin un segundo cliente. `db:types` usa `--schema public,cafe`, por lo que `database.types.ts` incluye `cafe`.
- Local: expuesto vía `[api] schemas`/`extra_search_path` en `supabase/config.toml`. Un stack local ya creado antes de esta migración no arranca (PostgREST falla con `schema "cafe" does not exist`): aplica antes la migración (`pnpm db:reset`, o arranca con el `config.toml` anterior y haz `supabase migration up --local`).
- **Paso MANUAL en staging y producción**: tras aplicar la migración, añadir `cafe` en *Settings → API → Exposed schemas* de cada proyecto; sin eso `.schema("cafe")` responde `PGRST106`.

### Escrituras transaccionales

**Regla: si una operación toca más de una tabla —o necesita ser atómica— es una función Postgres (`plpgsql`) llamada por RPC.** PostgREST no ofrece transacciones a través de varias llamadas, así que encadenar `insert`s desde un Server Action obliga a compensar a mano. El Server Action solo autentica (`requireRole(...)`), valida con Zod, llama a `callRpc()` y traduce el resultado; la lógica y las escrituras viven en la función, y si algo falla a mitad **no queda nada escrito**. Código nuevo (café y lo que venga) nace así; las escrituras de una sola tabla siguen siendo `from(...).insert/update` normales.

Plantilla SQL (va en una migración, ver *Migraciones*):

```sql
create or replace function <schema>.<verbo>_<entidad>(p_input jsonb)   -- o parámetros tipados
returns jsonb
language plpgsql
security invoker            -- RLS sigue aplicando con el usuario real
set search_path = ''        -- todo calificado: public.tabla, no tabla
as $$
declare v_id uuid;
begin
  -- 1) reglas de negocio ANTES de escribir
  if <condición> then
    raise exception using errcode = 'P0001', message = 'codigo_error', detail = 'texto para el usuario';
  end if;
  -- 2) escrituras: todas en la misma transacción implícita de la función
  -- 3) return jsonb_build_object('id', v_id);
end $$;

revoke execute on function <schema>.<fn>(jsonb) from public, anon;
grant execute on function <schema>.<fn>(jsonb) to authenticated;
```

- **Errores de negocio**: `errcode = 'P0001'` y `message` = código estable en snake_case (`stock_insuficiente`, `orden_proceso_invalido`, `consecutivo_bloqueado`); el texto legible va en `detail`. Un `raise exception 'texto libre'` también es P0001 pero `callRpc()` no lo toma por código (lo trata como error inesperado).
- **Nunca `SECURITY DEFINER` para lógica de negocio**: saltaría RLS y el aislamiento por `tenant_id`. Única excepción hoy: `siguiente_consecutivo()` (ver *Consecutivos por serie y año*), que comprueba tenant y rol por sí misma. `security invoker` + RLS + `DEFAULT tenant_actual()` hacen que la función herede el aislamiento sin código extra (y no pases `tenant_id` en el payload).
- El `revoke`/`grant` es obligatorio: Postgres da `EXECUTE` a `PUBLIC` al crear la función.
- Cada función lleva su test pgTAP (`supabase/tests/`); el ejemplo de referencia es `30_rpc_transaccional.test.sql` (`ping_transaccional`, que **solo existe dentro del test**, no en migraciones) y demuestra el rollback completo ante un fallo a mitad.

Wrapper TS (`src/modules/core/rpc/call-rpc.ts`, exportado por `@/modules/core`):

```ts
const r = await callRpc("cafe", "crear_lote", { p_input: datos });   // Result<T>
if (!r.ok) return { error: r.message };   // r.code para ramificar; r.message va al toast
```

`Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string }`. Mapea `42501` → `no_autorizado`, `23505` → `duplicado`, `23503` → `referencia_invalida`, `P0001` → `message` como código y `detail` como mensaje, y cualquier otro → `error_inesperado` (se reporta a Sentry solo con el nombre de la función y el SQLSTATE: **nunca** los argumentos). `mensajes.ts` guarda el diccionario código → mensaje en español para los toasts: al estrenar un código en SQL, añádelo ahí. `args` y el retorno se tipan con `Database[schema]["Functions"][fn]` (tras `pnpm db:types`); mientras la función no esté en los tipos generados `args` es un objeto libre y el retorno `unknown`, que se puede afinar con el genérico `T`. El wrapper no valida en ejecución lo que devuelve Postgres.

> **DEUDA TÉCNICA (Fase 2)**: hoy hay escrituras multi-tabla con **compensación manual** que deberían migrar a RPC y **no se han tocado**: *arriendos* (abono + gasto espejo: se crea el gasto y se borra si el abono falla; al borrar un arriendo se quitan a mano los gastos de sus abonos) y *pajillas* (se descuenta el stock al registrar la inseminación y se reintegra si el insert del evento falla; `ajustarStockPajilla()`). No copies esa técnica en código nuevo.

**Inventario tipo kardex (FIN-96)** (`src/modules/core/inventario/`, migración `20261029130000_inventario_kardex.sql`): inventario genérico del núcleo para cualquier vertical (insumos de empaque y producto terminado del café; ganadería sigue con `pajillas.cantidad_disponible`, que **no** se migra en Fase 0).
- **El stock es siempre la suma de movimientos; nadie edita un número de stock.** `articulos` (catálogo: `tipo`, `unidad`, `atributos` jsonb, `stock_minimo`, `activo`) + `movimientos_inventario` (`cantidad` con signo, `motivo`, `costo_unitario`, `ref_tipo`/`ref_id`, `observaciones`). `v_stock` (stock actual y `bajo_minimo`, estricto `stock < stock_minimo`; NULL = sin alerta) y `v_kardex` (saldo acumulado por artículo, ordenado por `fecha, created_at, seq`) son `security_invoker`, así que el RLS filtra por cliente.
- **Append-only**: `movimientos_inventario` no tiene UPDATE ni DELETE para nadie (privilegios revocados, también a `service_role`, y sin política). Corregir = un movimiento `ajuste` con observación obligatoria (CHECK). Signo y motivo van coherentes por CHECK (`movimiento_signo_valido()`): `saldo_inicial|compra|produccion|devolucion` > 0, `consumo|venta|cortesia|muestra|perdida|reapertura` < 0, `ajuste` cualquiera.
- **`registrar_movimientos(p_movs jsonb, p_permitir_negativo boolean)` es la ÚNICA vía de escritura de movimientos** (`SECURITY INVOKER`, patrón de *Escrituras transaccionales*; en TS `registrarMovimientos()`). Nunca `.insert()` directo desde la app: la RPC acepta varios movimientos en una transacción (empacar = −bolsa −etiqueta +producto terminado), serializa por artículo, comprueba el stock y devuelve `{ movimientos, stocks, advertencias }`. Una salida que deja un artículo en negativo falla con `stock_insuficiente` (`P0001`, no queda nada escrito) salvo `p_permitir_negativo = true` (caso venta), que registra y lo devuelve en `advertencias`. Otros códigos: `movimientos_invalidos`, `movimiento_invalido`, `articulo_no_encontrado`, `articulo_inactivo` (ya en `mensajes.ts`).
- **La serialización usa `pg_advisory_xact_lock` por artículo, no `select … for update`**: con `FOR UPDATE` el RLS exige también la política de UPDATE de `articulos` (solo `owner|admin`) y un `operativo`, que sí registra movimientos, no vería filas que bloquear. Vale porque toda escritura de movimientos pasa por la RPC.
- **Roles (membresías, no `roles` legacy)**: lectura para cualquier miembro; `articulos` INSERT/UPDATE solo `owner|admin`, sin DELETE (**un artículo usado no se borra, se desactiva**, y un desactivado no admite movimientos); `movimientos_inventario` INSERT `owner|admin|operativo` (necesario porque la RPC es `SECURITY INVOKER`). Los Server Actions comprueban el rol con `rol_en_tenant()` (`lib/autorizar.ts`). **Desde FIN-104 el INSERT de un movimiento con `motivo = 'ajuste'` es solo `owner|admin`** (un `operativo` registra todo lo demás).
- **Detalles del esquema**: `articulos.tipo` y `unidad` no se editan una vez creado (UPDATE por columnas); `unique (tenant_id, tipo, atributos)` evita dos "Excelso 500 g" pero es **parcial** (`where atributos <> '{}'`) para que los artículos sin atributos no queden limitados a uno por tipo; la FK compuesta `(tenant_id, articulo_id)` impide por construcción un movimiento sobre el artículo de otro cliente; `movimientos_inventario.seq` (identity) desempata los movimientos de una misma llamada para que el saldo sea determinista. `articulos` está auditada; los movimientos no (ya son un log).
- Sin página propia en el núcleo (la ponen los verticales: café tiene la de insumos, ver *Insumos de empaque*). `database.types.ts` ya incluye estos objetos, pero `lib/cliente.ts` sigue tipándolos a mano (deuda: sustituirlo por `createClient()` directo, ver su TODO); fuera de alcance: costeo promedio ponderado.

### Consecutivos por serie y año (FIN-95)

Los códigos de negocio con número correlativo (`MP-2026-0001` lote de marca propia, `MQ-…` lote de servicio, `REM-…` remisión) los genera **un único generador atómico por `(tenant, serie, año)`**: `public.siguiente_consecutivo(p_serie text, p_fecha date default null) returns text`. **Nunca `max(codigo) + 1`**: con dos usuarios a la vez los dos leen el mismo máximo y generan el mismo código, y tampoco reinicia por año.

- **Tablas**: `series_consecutivo (tenant_id, serie, descripcion, formato, reinicia_anual, activo)` es la configuración (PK `(tenant_id, serie)`, más `id` para `audit.activar`; auditada); `consecutivos (tenant_id, serie, anio, ultimo)` es el contador (`anio = 0` si la serie no reinicia). SELECT para cualquier miembro del tenant; `series_consecutivo` la escriben `owner`/`admin`; `consecutivos` **no la escribe nadie** (privilegios revocados, ni `service_role`): el único camino es la función. Un contador se corrige a mano solo desde el SQL editor.
- **Definir una serie nueva** es una fila, sin deploy (la hace el alta de tenants, FIN-98, o un `owner`/`admin`; `tenant_id` sale de `tenant_actual()` y desde SQL/service role va explícito):

  ```sql
  insert into public.series_consecutivo (tenant_id, serie, descripcion, formato, reinicia_anual)
  values ('<tenant>', 'MP', 'Lotes de marca propia', '{serie}-{anio}-{n:4}', true);
  ```

  `serie` son 1–10 letras, cifras o `_`. `formato` admite `{serie}`, `{anio}` y `{n:4}` (número relleno con ceros hasta 4 cifras; `{n}` sin relleno) y **debe llevar `{n}`** (CHECK); si el número supera el ancho sigue creciendo sin truncar (`MP-2026-10000`). Con `reinicia_anual = false` el contador es uno solo y `{anio}` muestra el año de la fecha. Decide `reinicia_anual` **antes** de usar la serie: cambiarlo después no migra los contadores. `activo = false` apaga la serie (`serie_no_configurada`); una serie con contadores no se puede borrar (`on delete restrict`), se desactiva.
- **Llamarla desde una RPC**, dentro de **su** transacción, en el mismo bloque que inserta el documento:

  ```sql
  -- dentro de una función plpgsql `security invoker` (ver Escrituras transaccionales)
  v_codigo := public.siguiente_consecutivo('MP', p_fecha_recepcion);   -- null → fecha local del tenant
  insert into cafe.lotes (codigo, ...) values (v_codigo, ...);
  ```

  Pasa la fecha del **documento** si la RPC la conoce; con `null` usa la fecha local del tenant (`tenants.zona_horaria`, no UTC: el 31/12 a las 20:00 en Bogotá no es año nuevo). Es `SECURITY DEFINER` —**excepción documentada** a la regla de `security invoker`, porque los usuarios no deben poder editar contadores— y comprueba ella misma `tenant_actual()` no nulo y `rol_en_tenant() in ('owner','admin','operativo')` (un `viewer` o un usuario sin tenant → `42501`, `callRpc` lo da como `no_autorizado`) y que la serie exista y esté activa (si no, `P0001` `serie_no_configurada`). El tenant nunca viene por parámetro.
- **Concurrencia**: el número sale de un `insert … on conflict (tenant_id, serie, anio) do update set ultimo = ultimo + 1 returning ultimo`; el bloqueo de fila del upsert serializa a quien pide la misma serie y año (quien llega segundo espera a que el primero termine). Verificado con `pnpm test:concurrencia` (`scripts/test-consecutivos-concurrencia.ts`: 20 llamadas en paralelo vía supabase-js contra la Supabase local → 20 códigos distintos y consecutivos).
- **Huecos**: el contador va en la transacción de quien llama, así que si la RPC falla **después** de pedir número, el rollback revierte también el contador y el número **no se consume** (lo recibe la siguiente llamada; `60_consecutivos.test.sql` lo prueba). Sí puede quedar un hueco cuando un número ya confirmado pierde su documento (se borra o se anula): **no se reutiliza ni se rellena** a mano. Por eso pide el número lo más tarde posible dentro de la RPC y nunca lo pidas desde el cliente "para mostrarlo": para previsualizar ("Próximo número: MP-2026-0013") lee `consecutivos.ultimo` y formatea con `formatearConsecutivo(formato, serie, anio, n)` (`@/modules/core`, `src/modules/core/consecutivos/formato.ts`), que da lo mismo que `public.formatear_consecutivo()` (mismos casos en `formato.test.ts` y en el test pgTAP) y **no reserva nada**.
- Un código de error nuevo se añade a `mensajes.ts`; `serie_no_configurada` ya está.

### Terceros (FIN-93)

**Maestro único de terceros** (`public.terceros`, módulo `core.terceros`; `src/modules/core/terceros/`, página `/dashboard/terceros`): proveedores y clientes en una sola tabla; cada tercero combina **roles** (`roles text[]`: `proveedor`, `cliente`, `cliente_servicio`, con CHECK; el formulario exige al menos uno, la base no). Hoy **ningún cliente tiene el módulo**: se activa con una fila en `tenant_modulos` (ver *Módulos por cliente*).
- **El módulo se exige en el RLS**, no solo en la app: las tres políticas llevan `(select public.tenant_tiene_modulo('core.terceros'))` además del `tenant_id`. SELECT cualquier miembro; INSERT `owner|admin|operativo` (la HU permite crear en línea desde una recepción o una venta); UPDATE de datos maestros solo `owner|admin`, por columnas (`tenant_id`, `es_consumidor_final` y `created_*` no se tocan); **DELETE nadie** (`activo = false`). Un cliente sin el módulo no ve ni escribe nada aunque llame a la API.
- **Normalización en el trigger** `terceros_normalizar` (`BEFORE INSERT/UPDATE`): `identificacion` sin espacios, puntos ni guiones y en mayúsculas (`900.123.456-7` = `9001234567`), `nombre`/`direccion`/`telefono` con `trim` y espacios colapsados, `email` en minúsculas. La unicidad es `(tenant_id, tipo_identificacion, identificacion)` ya normalizada → `23505`. `normalizar_identificacion()`/`normalizar_nombre()` (SQL) y `lib/normalizar.ts` (TS) deben dar lo mismo: `normalizar.test.ts` y `supabase/tests/80_terceros.test.sql` comparten casos. El dígito de verificación (NIT) es un campo aparte y opcional; la identificación guardada incluye el que se haya escrito junto al número.
- **Consumidor final**: `public.asegurar_consumidor_final(p_tenant uuid default null)` (`SECURITY INVOKER`, idempotente, devuelve el id) crea `Consumidor final / OTRO / 222222222222 / roles ['cliente']`. Con sesión usa `tenant_actual()` y el RLS decide quién puede; **sin sesión (alta de clientes / seed de vertical) hay que pasar `p_tenant`** (el seed corre sin `auth.uid()`, ver *Desarrollo local*). El trigger `terceros_proteger_consumidor_final` lo hace un registro del sistema: al insertarlo fija los datos canónicos, y una vez creado no admite UPDATE de ningún tipo (`consumidor_final_protegido`, `P0001`). Solo hay uno por cliente (índice único parcial). Si otro tercero ya ocupa `222222222222` falla con `consumidor_final_no_disponible`.
- **Duplicados**: la RPC `public.buscar_terceros_similares(p_nombre, p_identificacion)` (`STABLE`, `SECURITY INVOKER`) devuelve hasta 5 terceros con la misma identificación normalizada (de cualquier tipo) **o** `similarity(nombre) > 0.4` (`pg_trgm`, esquema `extensions`: dentro de funciones con `search_path = ''` hay que calificar `extensions.similarity`). Incluye inactivos. Es **un aviso, no un bloqueo**: el formulario lo muestra al salir de nombre/identificación y, si hay parecidos que el usuario aún no vio, el primer intento de guardar se detiene; la identificación repetida sí la bloquea la base (`23505`).
- **Código**: Server Actions `crearTercero`/`actualizarTercero`/`desactivarTercero`/`reactivarTercero`/`buscarSimilares`/`listarOpcionesTerceros`/`asegurarConsumidorFinal`, todas con `requireModulo('core.terceros')` + `requireRolTenant([...])`; `listarTerceros()` pagina con `.range()`. **`TerceroCombobox`** (`components/tercero-combobox.tsx`) es el selector reutilizable: props `rol` (filtra), `permitirCrear` (abre el formulario y deja el nuevo seleccionado, sin recargar) e `incluirConsumidorFinal`. Se importa directo del fichero, no del barril `@/modules/core`.
- **Fuera de alcance**: `gastos.proveedor` y `pajillas.proveedor` siguen siendo texto libre (Fase 2).

### Tarifas y parámetros por cliente (FIN-94)

Dos piezas genéricas del núcleo (`src/modules/core/{tarifas,parametros}/`, migración `20261030120000_tarifas_parametros.sql`), con pantalla en `/dashboard/tarifas` (`src/app/dashboard/tarifas/`). `public.precios` (precio del litro de ganadería) **no se toca**.

- **`public.tarifas` es append-only**: `(tenant_id, concepto, valor numeric(14,2), unidad, vigente_desde)`, único por `(tenant, concepto, vigente_desde)`. **Cambiar una tarifa es insertar otra**; nadie tiene UPDATE (privilegio revocado, también a `service_role`) y el DELETE solo lo hace `owner`/`admin` (o `tiene_permiso('tarifas.editar')`) sobre tarifas **programadas** (`vigente_desde > now()`). Lo ya cobrado no cambia porque cada proceso guarda el valor que usó: calcúlalo con `calcularValor(pesoKg, tarifa)` (`Math.round` a pesos) y guárdalo en el proceso.
- **`public.tarifa_vigente(p_concepto, p_at default now())`** (`STABLE`, `SECURITY INVOKER`, filtra por `tenant_actual()`): la última con `vigente_desde <= p_at`; sin ninguna lanza `tarifa_no_definida` (`P0001`, concepto en `detail`; ya en `mensajes.ts`). Dentro de una RPC se llama directamente; desde TypeScript, `getTarifaVigente(concepto, fecha?)` (devuelve `Result<number>`, nunca 0 por defecto). `v_tarifas_vigentes` (`security_invoker`) da la que rige ahora por concepto y `tarifas_historial()` (`SECURITY DEFINER`, solo `owner`/`admin`, solo el cliente actual) el historial con el email de quien la creó.
- **`public.parametros`**: `(tenant_id, clave, valor jsonb)` con PK `(tenant_id, clave)` + `id` (solo para `audit.activar`). Lectura: cualquier miembro; escribe solo `owner`/`admin`, **solo el `valor`** (UPDATE por columnas), nadie borra. Se guarda con la RPC `guardar_parametro(clave, valor)` y se lee dentro de una RPC con `public.parametro(clave, default)`. Un JSON `null` guardado es un valor ("sin configurar"), no "falta".
- **Las definiciones viven en el código de cada módulo**, no en la base: `ParametroDef` (`clave`, `modulo`, `etiqueta`, `schema` Zod, `defecto`, `grupo`, `tipo`, `unidad`) y `ConceptoTarifaDef` (`concepto`, `modulo`, `etiqueta`, `unidad`). Las de café están en `src/modules/cafe/parametros.ts` (`PARAMETROS_CAFE`, `CONCEPTOS_TARIFA_CAFE`). Como `core` no puede importar un vertical, **las inyecta `src/modules/registry.ts`** llamando a `defineParametros()` / `defineConceptosTarifa()` al cargarse. El registro es estado de módulo: quien lo lea (la página y los Server Actions de la pantalla) debe hacer `import "@/modules/registry"` en su propio módulo; por eso los Server Actions reales viven en `src/app/dashboard/tarifas/actions.ts` y delegan en `*.service.ts` del núcleo (sin `"use server"`).
- **`getParametro(def | clave)`** (`parametros.queries.ts`, una consulta por request con `React.cache()`): valida con el `schema` de la definición y devuelve el `defecto` si no hay valor o es inválido (en ese caso, además, lo reporta a Sentry sin el valor). **Un vertical debería pasar su propia definición** (`getParametro(PARAMETROS_CAFE.capacidadTostadoraKg)`: tipado y sin depender del registro) en vez de la clave. Un fallo de lectura **lanza**: no se disfraza de defecto.
- **Visibilidad**: la entrada "Tarifas y parámetros" (`core/manifest.ts`) y la página usan el módulo `core.terceros` (no hay `core.tarifas` en el catálogo; no se inventó uno) y rol `owner`/`admin`; la pantalla solo ofrece las definiciones cuyo `modulo` tiene activo el cliente (hoy ninguno de ganadería). `crearTarifa` rechaza vigencias en el pasado (una tarifa nueva solo afecta a lo que se registre después) y conceptos que ningún módulo declara.
- Para **añadir** un parámetro o un concepto: su definición en el fichero del módulo (más su test) y nada más; sin migración ni deploy de base. Los valores por defecto de un cliente nuevo los siembra `platform.seed_vertical` (ver *Alta de clientes (FIN-98)*).

### Exportación a Excel e impresión térmica (FIN-97)

Dos utilidades del núcleo (`src/modules/core/{export,print}/`) para cualquier vertical. **No** sustituyen a los informes que ya existen (`informes-cooperativa`, `informes-animales`), que siguen con su ExcelJS a mano.

**Excel** (`core/export/`):
- `generarExcel(hojas, { tenant, filtrosAplicados })` arma el libro (cliente en la fila 1, título + filtros en la 2, cabecera congelada en la 3, `ySplit: 3`); la fila de `totales` lleva fórmulas `SUM` reales (con `result` en caché solo para visores que no recalculan). El formato lo fija la columna: `moneda` COP `"$"#,##0`, `peso` `#,##0.000` (el issue lo mencionaba pero no estaba en la lista de formatos), `porcentaje` `0.0%`. **El porcentaje espera la fracción** (0,19 → 19,0 %). Los totales solo admiten columnas numéricas, nunca la primera (lleva "TOTAL"), y se refieren a la columna por su `key`.
- **Fechas**: un `YYYY-MM-DD` (columna `date`) se escribe tal cual, sin pasarlo por `new Date()` (se correría un día en UTC-5); un instante (`timestamptz`) se lleva a la hora de pared de `tenant.zonaHoraria` y se escribe como `Date` UTC con esos mismos componentes, porque Excel no tiene zonas horarias.
- `fetchAllPaginado(pagina, pageSize = 1000, limite = 50_000)` recibe una **función `(desde, hasta) => consulta`** (no un builder: el de supabase-js muta con `.range()`), que debe ordenar de forma estable. A diferencia de `fetchAllRecolecciones` **lanza** si una página falla (un Excel truncado que parece completo es peor que un error) y al pasar del límite (`ExportError`).
- **Registro de recursos exportables**: cada módulo declara un `ExportadorDef` (`recurso`, `modulo`, `roles` de membresía y opcional `rolesLegacy`, `generar({ sesion, filtros })`) y `src/modules/registry.ts` lo agrega con `defineExportadores()` (mismo patrón que `defineParametros`; `core` no importa verticales). El del núcleo es `core/terceros/exportador.ts` y es la referencia: usa la misma consulta que la pantalla. Café aporta `cafe-lotes` (FIN-116, ver *Exportación de lotes y procesos*): una entrada más en `registry.ts`, sin tocar la ruta.
- `GET /api/export/<recurso>?…filtros` (`src/app/api/export/[recurso]/route.ts`): `getSesion()` → 401; recurso desconocido → 404; módulo no activo o rol no permitido → 403 (`autorizarExport()`, pura); error de la consulta → 500 con Sentry; demasiado grande → 413. Los `searchParams` son los de la pantalla. La ruta hace `import "@/modules/registry"` (el registro es estado de módulo). **Una pantalla que exporta pasa sus filtros por query string** para que el Excel los respete; el nombre sale de `nombreArchivoExport()`: `${slug}_${recurso}_${desde}_${hasta}.xlsx`.

**Impresión térmica** (`core/print/`, grupo de rutas `src/app/(print)/`):
- El layout `(print)` exige sesión él mismo (el proxy solo protege `/dashboard`), sin barra lateral ni header, y lee el ancho del rollo del parámetro **`core.impresora_ancho_mm`** (58 u 80, defecto 80; definido en `core/print/parametros.ts` y registrado en `registry.ts`). Va bajo el módulo `core.terceros` —no hay uno de impresión en el catálogo y crearlo exige migración— así que solo se edita en Tarifas y parámetros de clientes que ya lo tienen; sin valor rige 80.
- **`@page { size: 80mm auto }` NO funciona** (el issue lo proponía): Chrome descarta la declaración entera y imprime en Carta (comprobado con `--print-to-pdf`). Se usa `size: <ancho>mm 297mm` (`ALTO_PAGINA_MM`) y cada `.ticket` termina en salto de página. Si con la impresora real queda demasiado papel en blanco tras el corte, el alto es lo único que hay que tocar (o quitar `size` y dejar que el driver ponga el rollo).
- `?copias=N` = tiquetes **en total** (original + N−1 `CopiaCliente`, máximo 5); `?ancho=58|80` fuerza otro ancho en una página concreta volviendo a montar `EstiloTermico` (así calibra `/print/prueba`). Las páginas de impresión formatean fechas y pesos **en el servidor** (zona del cliente); no uses `window`/`Intl` del navegador para el contenido del tiquete.
- Componentes (`core/print/components/ticket.tsx`, de servidor): `TicketHeader`, `TicketLinea`, `TicketTabla`, `TicketSeparador`, `TicketPie`, `CopiaCliente`/`TicketCopias`; `ImprimirButton` es el único de cliente. Un tiquete nuevo = página bajo `src/app/(print)/print/<nombre>/` con esas piezas dentro de `<TicketCopias copias={…}>`. Calibración: `/print/prueba`.


