# 1. Monolito modular multi-vertical

- **Estado:** Aceptada
- **Fecha:** 2026-10-28
- **Contexto de entrega:** Fase 0 del proyecto «Plataforma multi-vertical» (FIN-81 a FIN-99)

## Contexto

Finca Toca nació como una app de gestión ganadera para un solo cliente. Hoy sirve a varios clientes de dos negocios distintos (fincas ganaderas —Villa Blanca y El Velero— y una cooperativa lechera) y va a sumar un tercero, el café, con reglas propias (lotes, procesos, remisiones, tarifas). La misma base de código y el mismo proyecto de Supabase tienen que servir a todos, y el equipo es pequeño: cada pieza de infraestructura que se duplica se paga en mantenimiento.

Hacía falta decidir cómo crecer sin tres cosas que ya dolían:

- **Aislamiento de datos**: un cliente nunca puede ver ni escribir filas de otro, aunque llame a la API de Supabase directamente con la clave pública.
- **Diferencias entre clientes**: qué pantallas tiene cada uno no puede ser un `if (cliente === …)` en el código.
- **Lo común no puede copiarse**: auditoría, consecutivos, inventario, terceros, tarifas, exportación o impresión los necesita más de un vertical.

## Decisión

Una **sola aplicación Next.js organizada como monolito modular**, con una base de datos compartida, un esquema de Postgres por dominio y aislamiento por cliente mediante RLS.

**1. Módulos dentro de la misma app (`src/modules/`).**
- `core/` es el núcleo de plataforma y no conoce ningún vertical: sesión, tenants y módulos, registro de navegación, RPC transaccionales, auditoría, consecutivos, inventario, terceros, tarifas y parámetros, exportación, impresión y alta de clientes.
- `ganaderia/`, `cooperativa/` y `cafe/` son verticales. Cada uno declara un **manifiesto** (`manifest.ts`) con sus entradas de navegación, el módulo del catálogo al que pertenece cada una y los roles que la ven.
- `src/modules/registry.ts` es el único fichero que ve todos los verticales: agrega los manifiestos y, junto a `core/registry/nav.ts`, construye el menú de cada sesión (`getNavParaSesion()`) a partir de los módulos activos del cliente y su rol. Lo mismo hace con los parámetros, conceptos de tarifa y exportadores que cada módulo declara.
- Las dependencias están **impuestas por lint**, no por convención (`eslint-plugin-boundaries`, error en `pnpm lint`, solo sobre `src/modules/**`): un vertical solo importa de `core`, de la UI/lib compartida y de sí mismo; `core` no importa ningún vertical; ningún módulo importa de `src/features/**` (el código existente de ganadería y cooperativa sigue ahí hasta la Fase 2); y solo `registry.ts` puede ver todos los verticales. Lo que dos verticales necesiten en común sube a `core`.

**2. Un esquema de Postgres por dominio.**
- `public`: tablas del lado finca y de la cooperativa, y las del núcleo.
- `cafe`: tablas del vertical de café, expuesto a la API; se consulta con el mismo cliente (`.schema("cafe")`).
- `platform`: lógica de operación de la plataforma (alta de clientes, seed por vertical). **No** se expone a la API ni a `anon`/`authenticated`: la app solo llama a los wrappers `public.platform_*` (`SECURITY DEFINER`, que verifican por dentro que quien llama es operador de plataforma).
- `audit`: el log de cambios, tampoco expuesto; se lee con una RPC que revalida rol y cliente.

**3. Aislamiento por cliente con RLS.**
- Cada tabla de negocio lleva `tenant_id NOT NULL DEFAULT tenant_actual()`; las políticas filtran por `tenant_id = tenant_actual()` y el `WITH CHECK` impide falsear el cliente en las escrituras. Los Server Actions no tocan `tenant_id`.
- Las tablas nuevas (núcleo y café) usan **membresías** (`tenant_members`, rol por cliente) en lugar de la tabla `roles` legacy; ambos modelos conviven hasta la Fase 2 (expand → migrate → contract).
- Los módulos que tiene cada cliente (`tenant_modulos`) son **datos**: activar uno es una fila, sin deploy. Esconder una opción en el menú es solo cosmético: cada página exige `requireModuloPagina()` y cada Server Action `requireModulo()`; RLS sigue siendo la frontera real.
- Las escrituras que tocan más de una tabla son funciones Postgres llamadas por RPC (`security invoker`, así heredan RLS), no encadenamientos de `insert` desde la app.

## Alternativas descartadas

**Un fork (o una rama de larga vida) por vertical.** Es lo más rápido para el primer cliente de café, pero el núcleo —auditoría, consecutivos, inventario, terceros— se copia y empieza a divergir desde el primer día: cada corrección de seguridad o de RLS hay que repetirla en cada copia, y unificar después cuesta más que haberlo evitado. También multiplica proyectos de Vercel, de Supabase y de CI para un equipo pequeño.

**Monorepo con una app por vertical y paquetes compartidos.** Separa mejor los verticales, pero obliga a publicar y versionar paquetes internos, a repetir autenticación, sesión, layout y despliegue en cada app, y a coordinar cambios de esquema entre despliegues independientes que comparten base. Para el tamaño actual del equipo y de la base de código el coste de coordinación supera el beneficio. Los límites que daría —que un vertical no dependa de otro— ya los da el lint dentro de un solo despliegue.

(Una base de datos o un proyecto de Supabase por cliente se descartó por la misma razón de coste operativo: cada migración y cada alta tendrían que repetirse N veces, y el aislamiento que se busca ya lo da RLS.)

## Consecuencias

**Positivas**
- Lo común se escribe una vez y lo usan todos los verticales; un cliente nuevo es configuración (alta desde `/admin/tenants/nuevo` o `pnpm tenant:create`), no código.
- Un solo despliegue, un solo CI y un solo flujo de migraciones (`develop` → staging, `main` → producción con aprobación).
- Las fronteras entre módulos fallan en `pnpm lint`, antes de revisar la PR.
- Los datos de un cliente quedan aislados por RLS aunque falle la capa de aplicación.

**Negativas / costes asumidos**
- Todos los verticales comparten despliegue y base: un fallo de build, una migración mala o un incidente de rendimiento afecta a todos los clientes. De ahí la regla de migraciones compatibles hacia atrás (expand → migrate → contract) y la revisión de Advisors antes de cada release.
- Dos modelos de acceso conviven mientras dura la migración (`roles` legacy y `tenant_members`), con las trampas que eso trae (p. ej. un platform admin sin fila en `roles` no lee las tablas legacy).
- La disciplina de RLS es obligatoria: cada tabla nueva necesita políticas y su test pgTAP de aislamiento por cliente.
- Las boundaries de lint solo cubren `src/modules/**`; mientras `src/features/**` no se migre, parte del código no está sujeta a ellas.
- Un cliente muy grande o con requisitos de aislamiento físico no cabría en este modelo sin replantearlo.

**Pendiente (Fase 2)**: unificar `roles` en `tenant_members`, dar `tenant_id` a la cooperativa, mover `src/features` a `src/modules/{ganaderia,cooperativa}`, sustituir las compensaciones manuales (arriendos, pajillas) por RPC, y migrar `proveedor` (texto) a terceros y pajillas al kardex.
