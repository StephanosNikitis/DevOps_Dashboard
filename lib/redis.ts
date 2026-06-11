/**
 * Sets up the Upstash Redis client.
 *
 * WHY UPSTASH AND NOT A STANDARD REDIS CLIENT?
 * Standard Redis clients (like `ioredis`) open a persistent TCP connection.
 * Vercel serverless functions are short-lived and can't maintain persistent
 * connections reliably. Upstash's @upstash/redis package uses an HTTP REST
 * API instead — each command is just an HTTPS fetch call. This works perfectly
 * in serverless environments.
 */

import { Redis } from "@upstash/redis";

/**
 * `redis` is the main Upstash Redis client.
 * Import this wherever you need Redis:
 *
 *   import { redis } from "@/lib/redis";
 *   await redis.set("key", "value");
 *   const val = await redis.get("key");
 */

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
