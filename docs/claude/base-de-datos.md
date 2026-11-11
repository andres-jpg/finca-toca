# Tablas (public)

> Detalle movido desde CLAUDE.md. Léelo antes de tocar esta área.

### Database Tables

| Table | Key columns |
|---|---|
| `extracciones_leche` | `id`, `fecha`, `litros_cantina` (se vende → ingreso), `litros_cria` (se queda para los terneros → gasto), `vacas_en_produccion` |
| `gastos` | `id`, `fecha`, `subconcepto_id` (FK), `valor`, `proveedor`, `numero_factura`, `pagado`, `observaciones`, `source` (NULL=manual, 'leche_cria' y 'arriendo_abono'=auto, mantenidos por su módulo) |
| `pagos` | `id`, `gasto_id` (UNIQUE FK→gastos), `forma_pago` (efectivo\|transferencia), `tipo_cuenta`, `banco`, `numero_cuenta` |
| `ingresos` | `id`, `fecha`, `subconcepto_id` (FK), `valor`, `observaciones`, `source` (NULL=manual, 'leche_extraccion'=auto) |
| `precios` | `id`, `created_at`, `valor`, `tipo` |
| `conceptos_gasto` + `subconceptos_gasto` | hierarchy for gastos categories |
| `conceptos_ingreso` + `subconceptos_ingreso` | hierarchy for ingresos categories |
| `animales` | `id` (UUID), `identificador` (text, **sin unique** — hay duplicados históricos, la unicidad por `(identificador, sexo)` se valida en código), `nombre`, `sexo` (enum `animal_sexo`), `raza` (enum `animal_raza`), `origen` (enum `vaca_origen`), `estado_productivo` (enum: leche\|levante_1\|levante_2\|produccion\|secado\|reproductor), `estado_reproductivo` (enum: pre_puber\|puber\|pre_servicio\|servicio\|por_confirmar\|rechequeo\|cargada, solo hembras), `fecha_compra`, `fecha_nacimiento`, `numero_registro`, `madre_id`/`padre_id` (FK→animales), `padre_pajilla_nombre`, `padre_alquiler_nombre`, `padre_alquiler_raza`, `nombre_largo` (solo El Velero), `madre_externa_nombre`, `sangre` (texto compuesto, solo El Velero), `concentrado_por_ordeno` (manual, solo hembras), `alta` |
| `eventos_animal` | `id`, `animal_id` (FK→animales, ON DELETE CASCADE), `animal_tipo` (vaca\|toro — vestigial, se deriva de `sexo`), `tipo_evento` (CHECK de 14 valores), `fecha`, `descripcion`, `responsable`, `resultado` (cargada\|rechequeo\|servicio, solo palpación/confirmación), `pajilla_id` (FK→pajillas, ON DELETE SET NULL — lote usado en la inseminación), `toro_id` (FK→animales), `requiere_revacunacion`/`periodo_revacunacion`/`fecha_revacunacion` (solo vacunación, con CHECK de coherencia), `created_at` |
| `pajillas` | `id` (UUID), `toro_nombre`, `toro_ref_id` (texto libre, **no es identificador**: hay refs repetidas como "NA"), `proveedor`, `fecha_compra`, `cantidad`, `cantidad_disponible`, `observaciones`, `created_at` |
| `arriendos` | `id` (UUID), `arrendatario`, `finca_nombre`, `fecha_inicio`, `fecha_fin`, `canon` (CHECK > 0), `observaciones`, `created_at` — CHECK `fecha_fin >= fecha_inicio`. El saldo **no** es columna |
| `arriendos_abonos` | `id` (UUID), `arriendo_id` (FK→arriendos, ON DELETE CASCADE), `fecha`, `valor` (CHECK > 0), `observaciones`, `gasto_id` (FK→gastos, ON DELETE SET NULL, único parcial), `created_at` |
| `vacas_legacy` / `toros_legacy` | Tablas previas a la unificación. **Ningún código las lee**; se conservan solo como respaldo del refactor — son el único sitio donde queda el `estado` antiguo (`jardin`\|`pre_jardin`\|`transicion`\|`produccion`\|`secado`) tras eliminarlo de `animales`. |
| `tenants` | `id`, `nombre`, `slug` (unique), `vertical` (enum `vertical`, sin DEFAULT), `estado` (enum `tenant_estado`), `plan` (text), `nit`, `logo_url`, `color_primario` (CHECK `#RRGGBB`), `zona_horaria`, `moneda`, `created_at`, `updated_at`/`updated_by` (trigger `set_updated`). Hoy: `villa-blanca`, `el-velero` (ganaderia) y `toca-lacteos` (cooperativa, solo fila) |
| `modulos` | `id` (text, `<vertical>.<nombre>`), `vertical` (NULL = núcleo), `nombre`, `descripcion`, `base`. Catálogo global sin `tenant_id`, lectura para `authenticated`, escritura solo plataforma |
| `tenant_modulos` | PK `(tenant_id, modulo_id)` + `id` (uuid único, solo para `audit.activar`), `activo`, `config` (jsonb), `activado_at`, `activado_por`. Lectura: el propio cliente; escritura: solo plataforma. Auditada |
| `series_consecutivo` | PK `(tenant_id, serie)` + `id` (uuid único, solo para `audit.activar`), `descripcion`, `formato` (`{serie}-{anio}-{n:4}`), `reinicia_anual`, `activo`. Lectura: miembros del tenant; escritura: `owner`/`admin`. Auditada |
| `consecutivos` | PK `(tenant_id, serie, anio)` (`anio = 0` si no reinicia), `ultimo`. FK a `series_consecutivo` (restrict). Solo la escribe `siguiente_consecutivo()`; nadie tiene INSERT/UPDATE/DELETE |
| `tarifas` | `id`, `tenant_id`, `concepto` (`cafe.trilla`), `valor` numeric(14,2), `unidad` (kg\|g\|unidad\|litro), `vigente_desde`, `observaciones`, `created_at/by`. **Append-only** (sin UPDATE; DELETE solo programadas). Auditada |
| `parametros` | PK `(tenant_id, clave)` + `id` (solo para `audit.activar`), `valor` jsonb, `updated_at/by`. Escribe `owner`/`admin`, solo el `valor`. Auditada |
| `cafe.lotes` | `id`, `tenant_id`, `codigo` (único por cliente), `linea` (marca_propia\|servicio), `tercero_id`, `tipo_cafe_id`, `fecha_recepcion`, `peso_recibido_kg`, `num_bultos`, `humedad_pct`, `densidad`, `alertas_calidad`/`rangos_calidad` (snapshot), `servicios` (`tipo_proceso[]`), `nivel_tueste`, `precio_compra_kg` (snapshot) + `valor_compra` (generada), `anulado_*`. Sin DELETE. Auditada (ver *Lotes y bultos*) |
| `cafe.lote_bultos` | `id`, `tenant_id`, `lote_id`, `numero`, `peso_kg`; único `(lote_id, numero)`; suman el peso del lote (constraint trigger diferido). Auditada |
| `roles` | `user_id`, `rol` (Postgres enum `rol`: `admin`\|`user`\|`viewer`\|`cooperativa_admin`\|`cooperativa_user`) |
| `fincas_cooperativa` | `id`, `nombre`, `precio_litro`, `activa`, `metodo_pago` (conductor\|punto_venta\|gerente), `created_at` |
| `rutas_cooperativa` | `id`, `nombre`, `created_at` |
| `rutas_fincas` | `ruta_id` (FK), `finca_id` (FK), `orden` (int) — unique (finca_id) |
| `recolecciones` | `id`, `finca_id` (FK), `fecha`, `litros`, `precio_litro`, `created_at` — unique (finca_id, fecha) |
| `itinerarios` | `id`, `nombre`, `created_at` |
| `itinerarios_fincas` | `itinerario_id` (FK→itinerarios), `finca_id` (FK→fincas_cooperativa), `orden` (int) |
| `user_itinerarios` | `user_id` (unique FK→auth.users), `itinerario_id` (FK→itinerarios) |
| `pagos_finca` | `id`, `finca_id` (FK), `itinerario_id` (FK, nullable), `fecha_inicio`, `fecha_fin`, `litros`, `estado` (pendiente\|pagado\|punto_venta\|devuelto), `responsable` (conductor\|punto_venta\|gerente), `fecha_marcado`, `activado_por`/`marcado_por` (FK→auth.users), `created_at`, `updated_at` |


