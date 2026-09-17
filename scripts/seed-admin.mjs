// Plain-JS admin seeder that runs INSIDE the app container (no tsx/dev deps
// needed): `docker compose exec app node scripts/seed-admin.mjs`.
// Reads SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME /
// SEED_ADMIN_ROLE (admin|observer) and upserts on email.
import postgres from "postgres";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME || "Chapter Admin";
const role = process.env.SEED_ADMIN_ROLE || "admin";

if (!url || !email || !password) {
  console.error("Set DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("SEED_ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}
if (role !== "admin" && role !== "observer") {
  console.error('SEED_ADMIN_ROLE must be "admin" or "observer".');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const hash = await bcrypt.hash(password, 12);

// The first full-admin account ever seeded becomes the owner (it can manage
// other accounts in the UI). Upserts never demote an existing owner.
const [{ owners }] =
  await sql`SELECT count(*)::int AS owners FROM admins WHERE is_owner`;
const isOwner = role === "admin" && owners === 0;

await sql`
  INSERT INTO admins (email, name, password_hash, role, is_owner)
  VALUES (${email}, ${name}, ${hash}, ${role}, ${isOwner})
  ON CONFLICT (email) DO UPDATE SET
    name = ${name},
    password_hash = ${hash},
    role = CASE WHEN admins.is_owner THEN 'admin'::admin_role ELSE ${role}::admin_role END
`;
await sql.end();
console.log(`Account ready: ${email} (${role}${isOwner ? ", owner" : ""})`);
