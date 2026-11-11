# Estructura de directorios

> Detalle movido desde CLAUDE.md. Léelo antes de tocar esta área.

### Directory Structure

```
src/
├── app/                              # Next.js App Router pages
│   ├── api/
│   │   ├── cron/animales-estados/    # GET (Bearer CRON_SECRET) → avance diario leche→levante_1→levante_2
│   │   ├── informes-cooperativa/     # GET → 2-sheet Excel report + payment vouchers (ExcelJS), cooperativa_admin only (+ /preview)
│   │   ├── informes-animales/        # GET → informe avanzado de animales (Excel)
│   │   ├── export/[recurso]/         # GET → exportación genérica a Excel por recurso registrado (FIN-97)
│   │   ├── itinerario-data/          # GET → conductor's assigned itinerario + today's synced data + pending pagos
│   │   ├── recolecciones-sync/       # POST → offline conductor sync of recolecciones (Dexie → Supabase)
│   │   └── pagos-sync/               # POST → offline conductor sync of pagos_finca estado changes
│   ├── dashboard/
│   │   ├── cooperativa/              # Cooperativa overview (has loading.tsx)
│   │   ├── fincas-cooperativa/       # Finca CRUD
│   │   ├── rutas-cooperativa/        # Route CRUD (el orden de las fincas es el de selección en el formulario)
│   │   ├── itinerarios/              # Itinerario CRUD (admin) / assigned-itinerario view (conductor)
│   │   ├── recolecciones/            # Daily milk collections — offline-first conductor PWA view
│   │   ├── pagos-cooperativa/        # Activar pagos por finca/período + historial (cooperativa_admin)
│   │   ├── usuarios-cooperativa/     # User → itinerario assignment (admin only)
│   │   ├── informes-cooperativa/     # Excel report generator
│   │   ├── animales/[id]/            # Animal detail page (vacas/[id] y toros/[id] solo redirigen)
│   │   ├── arriendos/                # Contratos de arriendo + abonos (módulo solo de Villa Blanca)
│   │   ├── terceros/ · tarifas/      # Núcleo: maestro de terceros (FIN-93), tarifas y parámetros (FIN-94)
│   │   └── ...                       # gastos, ingresos, extracciones, inventario, configuracion, informe-avanzado, mi-historial
│   ├── (auth)/                       # login, signup
│   ├── (platform)/admin/             # Backoffice de plataforma: alta y gestión de clientes (FIN-98), solo platform admin
│   └── (print)/print/                # Tiquetes para impresora térmica (FIN-97), sin barra lateral
├── features/                         # Feature modules — one per domain entity
│   ├── animales/
│   ├── eventos-animal/
│   ├── alertas/                      # lib/calcular-alertas.ts (pura) + queries + campana/tarjeta/ficha
│   ├── arriendos/                    # Arriendos + abonos; cada abono genera su gasto espejo
│   ├── mediciones-leche/             # Control lechero: mediciones mensuales de litros por animal (ficha)
│   ├── fincas-cooperativa/
│   ├── rutas-cooperativa/
│   ├── itinerarios/
│   ├── recolecciones/
│   ├── pagos-cooperativa/
│   ├── usuarios-cooperativa/
│   ├── informes-cooperativa/
│   └── [feature]/
│       ├── actions/                  # Server Actions (data mutations + queries)
│       ├── components/               # Feature-specific UI
│       └── schemas/                  # Zod validation schemas
├── components/
│   ├── layout/                       # Sidebar, header, dashboard shell
│   ├── shared/                       # data-table, entity-modal, date-picker, finca-combobox, etc.
│   ├── dashboard/                    # DashboardFilter
│   └── ui/                           # shadcn/ui primitives
├── lib/
│   ├── supabase/server.ts            # Server-side Supabase client (cookie-based)
│   ├── supabase/client.ts            # Client-side Supabase client
│   ├── supabase/relaciones.ts        # aUno()/aLista()/Rel<T>: relaciones embebidas (objeto o array) con tipos
│   ├── supabase/admin.ts             # Service-role client (server-only); hoy lo usan el cron y el envío de invitaciones de *Equipo* (FIN-103) — no hace authz propia, quien lo importe debe añadir él mismo un `requireRole()`/`getUserRole()`
│   ├── auth/                         # LEGACY (roles): getUserRole, getCurrentUser, checkRoutePermission, canWrite, canDelete, requireRole — código nuevo: getSesion() en modules/core/auth
│   ├── offline/                      # db.ts (Dexie/IndexedDB schema), sync.ts (syncQueue, syncPagos) — conductor offline-first flow
│   └── cooperativa/
│       └── recolecciones.ts          # Shared: fetchAllRecolecciones, FEDEGAN_PCT, MESES, RecRow
├── charts/
│   ├── chart-wrappers.tsx            # "use client" — next/dynamic(..., { ssr: false }) for the main dashboard charts
│   ├── cooperativa-chart-wrappers.tsx # Same pattern for the cooperativa dashboard charts
│   ├── gastos-ingresos-line-chart.tsx
│   ├── conceptos-donut-chart.tsx
│   ├── extracciones-line-chart.tsx
│   ├── gastos-cooperativa-chart.tsx
│   ├── litros-por-finca-chart.tsx
│   ├── litros-por-ruta-chart.tsx
│   └── recolecciones-trend-chart.tsx
└── types/index.ts                    # Shared TypeScript interfaces
```


