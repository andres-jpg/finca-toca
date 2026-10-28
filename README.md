# Finca Toca - Plataforma de Gestión Agropecuaria

Finca Toca es una plataforma multi-cliente y multi-vertical para la gestión agropecuaria. Hoy sirve a fincas ganaderas (control de ganado, producción lechera y finanzas) y a una cooperativa lechera (rutas de recolección, pagos a fincas y trabajo offline para conductores); el vertical de café está en construcción.

Es **una sola aplicación** con módulos activables por cliente, no una app por cliente: la decisión y sus alternativas están en [`docs/adr/0001-monolito-modular-multi-vertical.md`](docs/adr/0001-monolito-modular-multi-vertical.md).

## 🚀 Qué hace

- **Ganadería:** animales con doble estado (productivo y reproductivo), eventos, alertas calculadas, extracciones de leche con apuntes contables automáticos, gastos, ingresos, pajillas y arriendos.
- **Cooperativa:** fincas, rutas, itinerarios, recolecciones (PWA offline para conductores), pagos por finca e informes Excel.
- **Núcleo de plataforma:** clientes y módulos por cliente, membresías y roles, auditoría de cambios, consecutivos por serie y año, inventario tipo kardex, terceros, tarifas y parámetros, exportación a Excel e impresión térmica, y un backoffice (`/admin`) para dar de alta clientes.

## 🛠️ Tecnologías

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router) con React 19 y TypeScript
- **Base de datos y Auth:** [Supabase](https://supabase.com/) (PostgreSQL con RLS por cliente)
- **Estilos y UI:** [Tailwind CSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) y Radix UI
- **Formularios y validación:** React Hook Form + [Zod](https://zod.dev/)
- **Tablas y gráficos:** TanStack Table y Recharts
- **Offline (conductores):** PWA con Dexie (IndexedDB)
- **Informes:** ExcelJS
- **Pruebas:** Vitest (funciones puras) y pgTAP (RLS y funciones SQL)
- **Observabilidad:** Sentry
- **Despliegue:** Vercel + GitHub Actions (CI y migraciones)

El gestor de paquetes es **pnpm**.

## ⚙️ Desarrollo local

La base corre en local con el CLI de Supabase, que necesita **Docker** en marcha. Requisitos: Node.js 22 o superior y pnpm.

```bash
pnpm install
cp .env.local.example .env.local   # y rellena las dos claves con la salida de `pnpm db:status`
pnpm db:start                      # Postgres + Auth + PostgREST + Studio
pnpm db:reset                      # aplica supabase/migrations/ y supabase/seed.sql
pnpm dev                           # http://localhost:3000
```

`pnpm db:reset` borra y recrea la base local con datos de ejemplo; los usuarios de prueba (contraseña `password123`, solo local) están en la sección *Desarrollo local* de [`CLAUDE.md`](CLAUDE.md). **No apuntes `.env.local` a producción**; si alguna vez usas un proyecto remoto, que sea el de staging (ver [`supabase/README.md`](supabase/README.md)).

### Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Servidor de desarrollo, build de producción y arranque del build |
| `pnpm lint` | ESLint (incluye las reglas de dependencias entre módulos) |
| `pnpm exec tsc --noEmit` | Comprobación de tipos |
| `pnpm test` | Vitest (`pnpm test:watch`, `pnpm test:coverage`) |
| `pnpm test:db` | pgTAP contra la Supabase local (necesita `db:start` y `db:reset`) |
| `pnpm test:concurrencia` | 20 llamadas paralelas al generador de consecutivos |
| `pnpm db:start` / `db:stop` / `db:status` / `db:reset` | Gestión de la Supabase local |
| `pnpm db:types` | Regenera `src/lib/supabase/database.types.ts` tras cambiar el esquema |
| `pnpm db:diff <nombre>` | Genera una migración desde los cambios de la base local |
| `pnpm tenant:create` | Alta de un cliente desde terminal |

Los cambios de esquema siguen el flujo *local → `db diff` → PR → staging → producción*; las migraciones las aplica GitHub Actions al fusionar en `develop` y `main`. El detalle está en [`CLAUDE.md`](CLAUDE.md) (*Migraciones* y *Deployment*).

## 📊 Estructura del proyecto

- `src/app`: rutas de Next.js (`dashboard`, `api`, `(auth)`, `(platform)/admin`, `(print)`).
- `src/modules`: monolito modular — `core` (núcleo transversal), `registry.ts` y los manifiestos de cada vertical (`ganaderia`, `cooperativa`, `cafe`). Las dependencias entre módulos las vigila ESLint.
- `src/features`: lógica de ganadería y cooperativa por dominio (actions, components, schemas); migrará a `src/modules` en la Fase 2.
- `src/components`, `src/lib`, `src/types`: UI compartida, utilidades y clientes de Supabase, y tipos globales.
- `supabase/`: migraciones (fuente de verdad del esquema), seed, tests pgTAP y config del CLI.
- `docs/adr/`: decisiones de arquitectura.

## 📚 Más documentación

- [`CLAUDE.md`](CLAUDE.md): guía técnica completa (arquitectura, multi-tenancy, RLS, módulos, convenciones y despliegue).
- [`supabase/README.md`](supabase/README.md): entornos, enlace a staging y migraciones.
- [`docs/adr/`](docs/adr/): registros de decisiones de arquitectura.

---
Desarrollado para optimizar la productividad en el campo.
