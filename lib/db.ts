/**
 * Sets up the Drizzle ORM client connected to PostgreSQL via the `pg` package.
 *
 * WHY A CONNECTION POOL?
 * A Pool reuses existing TCP connections to Postgres instead of opening a new
 * one on every request. This is critical in Next.js because each API route
 * invocation should not open a fresh connection.
 *
 * LOCAL vs PRODUCTION:
 * - Local (Docker):  DATABASE_URL = postgresql://devops:devops_password@localhost:5432/devops_dashboard
 * - Production (Neon): DATABASE_URL = postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/drizzle/schema";

if(!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from environment variables.");
}

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

// Create the pg connection pool using DATABASE_URL from your .env.local
const pool =
  globalForDb.pool ??
  new Pool({
  connectionString: process.env.DATABASE_URL,

  // SSL is required by Neon (and most hosted Postgres), but NOT by local Docker.
  // This line auto-detects: if the URL contains "neon.tech", enable SSL.
  ssl: process.env.DATABASE_URL?.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : false,

  // Keep pool small — Neon free tier has a connection limit
  max: 10,
  idleTimeoutMillis: 30_000,
});

if(process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err);
});

/**
 * `db` is the main Drizzle instance.
 * Import this wherever you need to query the database:
 *
 *   import { db } from "@/lib/db";`
 *   const rows = await db.select().from(schema.deployments);
 */
export const db = drizzle(pool, { schema });

// Export pool separately in case you ever need a raw SQL query
export { pool };