# Vertical cooperativa

> Detalle movido desde CLAUDE.md. Léelo antes de tocar esta área.

### Cooperativa Module

The cooperativa module manages a milk cooperative: farms (fincas), collection routes (rutas), driver itineraries (itinerarios), daily milk pickups (recolecciones), per-finca payments (pagos-cooperativa), user-to-itinerario assignments, and Excel report generation.

**Features and pages:**

| Feature | Route | Access |
|---|---|---|
| `fincas-cooperativa` | `/dashboard/fincas-cooperativa` | `cooperativa_admin` |
| `rutas-cooperativa` | `/dashboard/rutas-cooperativa` | `cooperativa_admin` |
| `itinerarios` | `/dashboard/itinerarios` | `cooperativa_admin` (manage), `cooperativa_user` (view own) |
| `recolecciones` | `/dashboard/recolecciones` | `cooperativa_admin`, `cooperativa_user` |
| `pagos-cooperativa` | `/dashboard/pagos-cooperativa` | `cooperativa_admin` |
| `usuarios-cooperativa` | `/dashboard/usuarios-cooperativa` | `cooperativa_admin` |
| `informes-cooperativa` | `/dashboard/informes-cooperativa` | `cooperativa_admin` |
| Overview | `/dashboard/cooperativa` | `cooperativa_admin`, `cooperativa_user` |

**`rutas` vs. `itinerarios`**: `rutas_cooperativa`/`rutas_fincas` is the coarser grouping used for Excel reports (`informes-cooperativa`'s `ruta` type) and for searching fincas in `pagos-cooperativa`. `itinerarios`/`itinerarios_fincas` is the actual conductor-facing assignment: `user_itinerarios` (la tabla `user_rutas` ya no existe) is what `usuarios-cooperativa` writes to, what `getItinerarioAsignado()`/the offline conductor view read from, and what `get_cooperativa_users()` joins against. A finca can belong to both a ruta and an itinerario independently — they aren't the same grouping.

**Data isolation for `cooperativa_user`**: In `getRecolecciones()`, if the caller's role is `cooperativa_user`, the query is automatically scoped to the fincas belonging to their assigned itinerario (`user_itinerarios` → `itinerarios_fincas`). If no itinerario is assigned, the function returns `[]`.

**Finca ordering**: both `rutas_fincas` and `itinerarios_fincas` have an `orden` column. Itinerarios se ordenan arrastrando (`itinerario-fincas-editor.tsx`, dnd-kit); en las rutas `orden` es la posición en la lista `finca_ids` del formulario (`rutas.actions.ts`), sin arrastrar.

**Recolecciones uniqueness**: `(finca_id, fecha)` has a UNIQUE constraint. The creation form excludes fincas that already have a collection on the selected date.

**Offline-first conductor flow** (`/dashboard/recolecciones` when role is `cooperativa_user`, rendered by `RutaConductorView`): IndexedDB (Dexie, `lib/offline/db.ts`) caches the assigned itinerario's fincas/precios and queues recolecciones + pago-estado changes locally so the conductor can keep working with no signal. `useSyncQueue()` syncs (`lib/offline/sync.ts`) on mount and on reconnect; see the offline-sync mutex/lost-update notes under Key Patterns before touching this code. `GET /api/itinerario-data` is the data source (always `NetworkOnly` in the service worker — never cached, since a cached response could replay yesterday's `syncedToday`). `POST /api/recolecciones-sync` and `POST /api/pagos-sync` upsert the queued changes; both are gated to `cooperativa_user`/`cooperativa_admin` via `getUserRole()`.

**Pagos por finca** (`pagos-cooperativa` feature, table `pagos_finca`): each `fincas_cooperativa` row has a `metodo_pago` (`conductor` | `punto_venta` | `gerente`) that's the default `responsable` for collecting payment. Flow: `getFincasConLitrosPorRuta(rutaId, fechaInicio, fechaFin)` finds fincas with recolecciones in a period (grouped by itinerario, with conductor emails resolved via `get_cooperativa_users()`); `activarPago(items, fechaInicio, fechaFin)` inserts `pagos_finca` rows (`estado: "pendiente"`) for the selected fincas, with `responsable` overridable per row. A pago's `estado` moves `pendiente` → `pagado` | `punto_venta` | `devuelto`, either by the conductor (offline-capable, only their own itinerario's `responsable: "conductor"` pagos — RLS-enforced, see below) or by an admin via `updateEstadoPago()` in the historial table. `getPagosHistorial(filters)` powers the filterable historial view (`historial-pagos-table.tsx`).

**Informe Excel**: `GET /api/informes-cooperativa` generates a single `.xlsx` with ExcelJS containing two sheets (unified in FIN-71 — payment vouchers used to be a separate download; `/api/comprobantes-pago` no longer exists). Supports four types: `finca` (single farm), `ruta` (all farms in a route), `itinerario` (all farms in an itinerario), `general` (all routes, grouped with subtotals). Auth-gated to `cooperativa_admin`. Supports both quincena mode (`quincena=1|2` + `mes` + `anio`) and free-range mode (`fechaDesde`/`fechaHasta`) for the Excel download; the `InformesForm` UI itself only exposes quincena mode for the download button (`"custom"` quincena disables it), custom range is only reachable via the preview.
- **Hoja 1 (resumen)**: top-left merged cells show the finca/ruta/itinerario name (row 1) and the generated period (row 2, `$A$2` — itinerario also appends `· Conductor: <email>` here), frozen above the header row (row 3, `ySplit: 3`). Columns: `ID` (1-based consecutivo, numbered continuously top-to-bottom — not reset per ruta section in `general`), `Finca`, `Ruta` (itinerario only — a finca's ruta can differ from its itinerario), day columns, `Precio/L`, `Total Litros`, `Precio Bruto`, `Des. Fedegan`, `Descuento almacén` (new — manual, defaults to `0`), `Precio Neto`. Every derived cell is a real Excel formula (`Total Litros = SUM(days)`, `Precio Bruto = Precio/L * Total Litros`, `Des. Fedegan = Precio Bruto * <pct>` with the per-route `getFedeganPct()` value baked in as a literal, `Precio Neto = Precio Bruto - Des. Fedegan - Descuento almacén`), including TOTAL/subtotal/grand-total rows (`general`'s grand total sums the individual subtotal-row cells, not a range, to avoid double-counting) — editing a day's liters by hand recalculates everything downstream without regenerating the report.
- **Hoja 2 (comprobantes de pago)**: compact 6-vouchers-wide × 10-rows-tall grid (2 Excel columns per voucher, no gap rows between bands), landscape — same dimensions as the reference format "Formato Reportes y Pagos.xlsx" this ticket restored (the old `/api/comprobantes-pago` 3×3 portrait grid was reported as noticeably bigger than expected). Every voucher cell is a formula referencing Hoja 1 directly by row (ID, Finca, Total Litros, Precio Bruto, Descuento almacén, Des. Fedegan) plus a manual `Saldo Anterior` (defaults `0`) and a `Total` formula — so a Descuento almacén edited on Hoja 1 updates its voucher automatically. `buildSheet1Simple`/`buildSheet1Itinerario`/`buildSheet1General` each return the written finca row numbers (`voucherRows`) and the resolved column layout (`ColLayout`, since itinerario's extra Ruta column shifts every later column by one) that `buildSheet2Comprobantes` needs to build these cross-sheet references.

**Shared cooperativa lib** (`lib/cooperativa/recolecciones.ts`): exports `fetchAllRecolecciones(supabase, fincaIds, start, end)` (paginated, bypasses PostgREST max_rows), `FEDEGAN_PCT = 0.0075`, `MESES` array, and `RecRow` type. `informe-data.ts` (shared by the preview API and the `informes-cooperativa` Excel export) imports from here. `cooperativa/page.tsx` and `recolecciones.actions.ts`'s `getRecolecciones()` each have their own near-identical paginated-fetch loop instead of reusing this helper — worth consolidating if touched again, but not currently broken.

**RLS policies**: every base table's RLS checks `roles.rol`, not just `TO authenticated`. Example, `recolecciones`:

| Operation | Allowed roles |
|---|---|
| SELECT | `admin`, `cooperativa_admin`, `cooperativa_user` |
| INSERT | `admin`, `cooperativa_admin`, `cooperativa_user` |
| UPDATE | `admin`, `cooperativa_admin`, `cooperativa_user` |
| DELETE | `admin`, `cooperativa_admin` |

`pagos_finca` is the one table with row-ownership policies beyond a flat role check: `cooperativa_admin` has full access; `cooperativa_user` can only SELECT/UPDATE rows for fincas in *their own* assigned itinerario (joins `roles` → `user_itinerarios` → `itinerarios_fincas`), and only UPDATE while `responsable = 'conductor'` and `estado = 'pendiente'`. Use this policy as the template for any future "user can only touch their own assignment" table.

**User-itinerario assignment**: `usuarios-cooperativa` uses `user_itinerarios` (upsert on `user_id`) and calls the `get_cooperativa_users` RPC (returns all users with `cooperativa_user` role + their assigned itinerario + email). That RPC is `SECURITY DEFINER` and must **never** be granted to `anon` or `PUBLIC` (Postgres grants `EXECUTE` to `PUBLIC` by default on function creation — revoking only the explicit `anon` grant is not enough, you also need `REVOKE EXECUTE ... FROM PUBLIC`) since it returns driver emails; it's deliberately granted to `authenticated` only. `getItinerarios()` additionally requires the caller's role be `admin`/`cooperativa_admin`/`cooperativa_user` before calling it, since farm-side roles (`user`/`viewer`) have no legitimate reason to read cooperative driver emails.

**Shared component**: `components/shared/finca-combobox.tsx` — searchable combobox for picking a finca, used in the informes form.


**Offline sync mutex** (`hooks/useSyncQueue.ts`): the "is a sync already running" lock is a `useRef`, not a `useState` — a ref is read/written synchronously, so two near-simultaneous `syncNow()` calls (e.g. the mount effect and the reconnect-timer effect both firing) can't both pass the check before either sets the lock. A `useState`-based lock would race here because `setState` is batched/deferred. `isSyncing` (the `useState`) only drives the UI ("Sincronizando…" badge); never use it as the actual guard.

**Offline sync lost-update guard** (`lib/offline/sync.ts`): `syncQueue()`/`syncPagos()` snapshot the `pending` Dexie records, await the network round-trip, then must re-check the record in IndexedDB still matches the snapshot before marking it `synced` — if the conductor edited it again while the request was in flight, blindly overwriting `syncStatus` would silently drop that newer edit (it would never be retried, since it's no longer `pending`). Any new offline-sync write path must follow this same "compare-before-commit" pattern, not just flip the status on a successful response. All sync triggers should go through `useSyncQueue()`'s `syncNow()` (the guarded entry point) rather than calling `syncQueue()`/`syncPagos()` directly, to avoid two syncs running concurrently.


