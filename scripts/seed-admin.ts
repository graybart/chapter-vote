/**
 * Bootstrap (or update) an admin account.
 *
 *   SEED_ADMIN_EMAIL=you@x.com SEED_ADMIN_PASSWORD=secret npm run seed:admin
 *
 * View-only accounts (can watch live results but can't change anything):
 *
 *   SEED_ADMIN_EMAIL=a@x.com SEED_ADMIN_PASSWORD=... SEED_ADMIN_ROLE=observer \
 *     SEED_ADMIN_NAME="Chapter A" npm run seed:admin
 *
 * Reads .env if present. Safe to run repeatedly (upserts on email, so it
 * also works for changing someone's password or role).
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import bcrypt from "bcryptjs";
import { admins } from "../src/db/schema";

function loadDotEnv() {
  const p = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Chapter Admin";
  const role = process.env.SEED_ADMIN_ROLE ?? "admin";

  if (role !== "admin" && role !== "observer") {
    console.error('SEED_ADMIN_ROLE must be "admin" or "observer".');
    process.exit(1);
  }
  if (!url || !email || !password) {
    console.error(
      "Set DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (env or .env).",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("SEED_ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);
  const passwordHash = await bcrypt.hash(password, 12);

  // First full admin ever seeded becomes the owner; never demote an owner.
  const [{ owners }] =
    await sql`SELECT count(*)::int AS owners FROM admins WHERE is_owner`;
  const isOwner = role === "admin" && Number(owners) === 0;
  const [existing] = await sql`
    SELECT is_owner FROM admins WHERE email = ${email}
  `;
  const effectiveRole = existing?.is_owner ? "admin" : role;

  await db
    .insert(admins)
    .values({ email, name, passwordHash, role: effectiveRole, isOwner })
    .onConflictDoUpdate({
      target: admins.email,
      set: { name, passwordHash, role: effectiveRole },
    });

  await sql.end();
  console.log(`Account ready: ${email} (${effectiveRole}${isOwner ? ", owner" : ""})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
