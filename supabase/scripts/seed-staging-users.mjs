// Crea los usuarios de prueba de STAGING (Auth + tenants + roles).
//
//   STAGING_SUPABASE_URL=https://<ref-staging>.supabase.co \
//   STAGING_SERVICE_ROLE_KEY=... \
//   STAGING_TEST_PASSWORD=... \
//   node supabase/scripts/seed-staging-users.mjs
//
// La contraseña NO está en el repo: se lee del entorno. Es idempotente (re-ejecutable).
// Se niega a correr contra el proyecto de producción.
import { createClient } from "@supabase/supabase-js";

const PROD_REF = "tqaprzgccgoiiqxzincv";
const url = process.env.STAGING_SUPABASE_URL;
const key = process.env.STAGING_SERVICE_ROLE_KEY;
const password = process.env.STAGING_TEST_PASSWORD;

if (!url || !key || !password) {
  console.error("Faltan STAGING_SUPABASE_URL, STAGING_SERVICE_ROLE_KEY o STAGING_TEST_PASSWORD.");
  process.exit(1);
}
if (url.includes(PROD_REF)) {
  console.error("Abortado: la URL es la de PRODUCCIÓN.");
  process.exit(1);
}

const TENANTS = [
  { nombre: "Villa Blanca", slug: "villa-blanca" },
  { nombre: "El Velero", slug: "el-velero" },
];

// Mismos emails y roles que en producción. tenant = null → roles de cooperativa (no multi-tenant)
const USUARIOS = [
  { email: "andrescovg@gmail.com", rol: "admin", tenant: "villa-blanca" },
  { email: "diana.sanchezf@outlook.com", rol: "admin", tenant: "villa-blanca" },
  { email: "andrescorreasan@icloud.com", rol: "user", tenant: "villa-blanca" },
  { email: "viewer@example.com", rol: "viewer", tenant: "villa-blanca" },
  { email: "elvelero@appfinca.com", rol: "admin", tenant: "el-velero" },
  { email: "tocalacteos@appfinca.com", rol: "cooperativa_admin", tenant: null },
  { email: "tocalacteosuser@appfinca.com", rol: "cooperativa_user", tenant: null },
];

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { error: tErr } = await supabase.from("tenants").upsert(TENANTS, { onConflict: "slug" });
if (tErr) throw tErr;
const { data: tenants, error: tsErr } = await supabase.from("tenants").select("id, slug");
if (tsErr) throw tsErr;
const tenantId = Object.fromEntries(tenants.map((t) => [t.slug, t.id]));

const { data: existentes, error: lErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (lErr) throw lErr;

for (const u of USUARIOS) {
  let user = existentes.users.find((x) => x.email === u.email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
  }
  const { error } = await supabase.from("roles").upsert(
    { user_id: user.id, rol: u.rol, tenant_id: u.tenant ? tenantId[u.tenant] : null },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  console.log(`ok  ${u.email}  ${u.rol}  ${u.tenant ?? "-"}`);
}
