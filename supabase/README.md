# supabase/

Esquema y entornos de base de datos de Finca Toca.

```
supabase/
├── config.toml      # config del CLI (proyecto local; `project_id = "finca-toca"`)
├── migrations/      # FUENTE DE VERDAD del esquema `public` (CLI de Supabase)
├── legacy/          # historia: .sql sueltos anteriores + scripts del antiguo schema `preview`
└── scripts/         # utilidades (usuarios de prueba de staging)
```

## Entornos

| Entorno | Proyecto Supabase | project_ref | Lo usa |
|---|---|---|---|
| Producción | `Finca Toca` (eu-west-1) | `tqaprzgccgoiiqxzincv` | Vercel **Production** (`main`) |
| Staging | (ver nota) | `wiquvwviaawvpjkthdam` | Vercel **Preview** (`develop`) y `.env.local` |

Ambos usan el schema `public`. Ya no existe `NEXT_PUBLIC_SUPABASE_SCHEMA`.

> Decisión (FIN-81): el proyecto de staging se llama `blue-pre`, está en otra organización de Supabase
> (`fodpextzsieizkmeodzb`) y en `eu-central-1`, mientras producción está en `eu-west-1`. Se acepta así
> mientras staging solo se use para pruebas: el esquema es idéntico, pero su latencia no representa la de
> producción, así que no uses staging para medir rendimiento. Si más adelante hace falta, se recrea en
> `eu-west-1` aplicando la baseline.

## Desarrollo local

`supabase/seed.sql` se ejecuta con `pnpm db:reset` (datos ficticios y usuarios con contraseña `password123`,
**solo local**). El flujo completo y la tabla de usuarios están en CLAUDE.md, sección *Desarrollo local*.

## Variables de entorno

Para desarrollo normal usa la Supabase local (plantilla en `.env.local.example`). Si necesitas probar contra
staging, `.env.local` (gitignored) apunta a **staging**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://wiquvwviaawvpjkthdam.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_...   # clave de staging
SUPABASE_SERVICE_ROLE_KEY=...                                      # clave de staging
CRON_SECRET=...
```

En Vercel: **Production** → claves del proyecto de producción; **Preview** → claves del de staging.

## Migraciones (CLI)

```bash
supabase login
supabase link --project-ref wiquvwviaawvpjkthdam   # staging
supabase projects list                              # comprueba cuál queda enlazado (●)
pnpm db:push:staging                                # = supabase db push --linked
pnpm db:diff <nombre>                               # = supabase db diff -f <nombre> (genera la migración)
```

`supabase link` guarda el enlace en `supabase/.temp/` (gitignored). **Antes de cada `db push`
comprueba a qué proyecto apunta** (`cat supabase/.temp/project-ref`): `db:push:staging` empuja a lo que
esté enlazado, sea staging o producción. Producción solo se enlaza para empujar una migración ya
validada en staging.

> La baseline se aplicó a staging con el MCP de Supabase (`apply_migration`) y su fila en
> `supabase_migrations.schema_migrations` se renombró a `20261019000000` para que coincida con el fichero:
> el CLI la verá como ya aplicada. En **producción** la baseline NO se aplica (ya tiene ese esquema): al
> enlazar producción por primera vez hay que marcarla como aplicada con
> `supabase migration repair --status applied 20261019000000`.

Flujo: local → `db diff` → PR → staging → prod (ver CLAUDE.md, sección *Migraciones*).

## Usuarios de staging

Mismos emails, roles y clientes que en producción. Se crearon el 2026-10-19 directamente en staging
(Auth + `roles`) y, a petición de Andrés, **se copió el hash de la contraseña de producción**
(`auth.users.encrypted_password`): entran con la misma contraseña que en producción. No hay contraseñas
en el repo. Ojo: esas cuentas reales usan en staging una credencial de producción, en un entorno con
menos controles; cámbialas en staging (Authentication → Users) si alguna vez se comparte el acceso.
`supabase/scripts/seed-staging-users.mjs` crea cuentas de prueba adicionales por API (contraseña por
variable de entorno, nunca en el repo).

| Email | Rol | Cliente |
|---|---|---|
| `andrescovg@gmail.com` | `admin` | Villa Blanca |
| `diana.sanchezf@outlook.com` | `admin` | Villa Blanca |
| `andrescorreasan@icloud.com` | `user` | Villa Blanca |
| `viewer@example.com` | `viewer` | Villa Blanca |
| `elvelero@appfinca.com` | `admin` | El Velero |
| `tocalacteos@appfinca.com` | `cooperativa_admin` | — |
| `tocalacteosuser@appfinca.com` | `cooperativa_user` | — (en producción tiene el itinerario 4; en staging no hay itinerarios aún) |

Staging arranca **sin datos de negocio**: solo `tenants`, usuarios y `roles`. El catálogo de
conceptos/subconceptos y datos de ejemplo llegan con el seed local (CO-02).
