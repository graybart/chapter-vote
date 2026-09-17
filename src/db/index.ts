import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// postgres.js works on Vercel serverless (use a pooled Neon URL) and in
// Docker alike — no Vercel-specific driver.
// DB_POOL_MAX: on serverless, set to a small number (e.g. 2) since every
// function instance opens its own pool; the Docker default of 10 is fine
// for a single long-lived server.
const client = postgres(process.env.DATABASE_URL!, {
  max: Number(process.env.DB_POOL_MAX ?? 10),
});

export const db = drizzle(client, { schema });
export * as tables from "./schema";
