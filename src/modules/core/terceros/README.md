# terceros — maestro único (FIN-93)

Un solo maestro de proveedores y clientes por cliente (`public.terceros`). Cada tercero combina roles: **proveedor** de materia prima, **cliente** de marca propia y **cliente de maquila / servicio**. Solo existe para los clientes con el módulo `core.terceros` activo (el RLS lo exige).

| Pieza | Qué es |
|---|---|
| `schemas/tercero.schema.ts` | Zod 4: obligatorios (nombre, identificación, dirección, teléfono), correo opcional, al menos un rol. Normaliza y es idempotente. |
| `lib/normalizar.ts` | `normalizarIdentificacion()` / `normalizarNombre()`: espejo de las funciones SQL del mismo nombre. |
| `lib/roles.ts` | `ROLES_TERCERO`, `TIPOS_IDENTIFICACION` y sus etiquetas. |
| `actions/terceros.actions.ts` | `crearTercero`, `actualizarTercero`, `desactivarTercero`, `reactivarTercero`, `buscarSimilares`, `listarOpcionesTerceros`, `asegurarConsumidorFinal`. Devuelven `Result<T>`. |
| `queries/terceros.queries.ts` | `listarTerceros({ rol?, q?, activo?, incluirConsumidorFinal? })`, paginado con `.range()`. |
| `components/terceros-table.tsx` | Listado (`DataTable`) con filtros por rol y estado y búsqueda; alta y edición en `EntityModal`. |
| `components/tercero-form.tsx` | Formulario con aviso de duplicados (al salir de nombre/identificación y antes de guardar). |
| `components/tercero-combobox.tsx` | Selector reutilizable. |

## Usar el selector desde otro módulo

```tsx
import { TerceroCombobox } from "@/modules/core/terceros/components/tercero-combobox";

<TerceroCombobox
  value={proveedorId}
  onChange={(id) => setProveedorId(id)}
  rol="proveedor"          // solo terceros con ese rol; el alta en línea lo marca por defecto
  permitirCrear            // «Crear tercero» abre el formulario y deja el nuevo seleccionado
  incluirConsumidorFinal   // solo en ventas al público
/>
```

Importa del fichero directamente: el barril `@/modules/core` arrastra código de servidor. Las operaciones (recepción, venta) validan en su Server Action que el tercero tenga el rol que necesitan; el selector solo filtra.

Detalle de reglas (normalización, consumidor final, duplicados, RLS) en *Terceros (FIN-93)* en CLAUDE.md.
