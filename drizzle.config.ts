import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load .env.local so drizzle-kit can read DATABASE_URL when you run CLI commands
dotenv.config({ path: ".env.local" });

export default {
  // Where your table definitions live
  schema: "./drizzle/schema.ts",

  // Where drizzle-kit will write the generated SQL migration files
  out: "./drizzle/migrations",

  // We're using PostgreSQL
  dialect: "postgresql",

  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
