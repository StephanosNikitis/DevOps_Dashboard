/**
 * Pings both Postgres and Redis and returns their health status + latency.
 * This is the first route you test to confirm your infrastructure is wired up.
 *
 * If either service is down, status becomes "degraded" and HTTP status is 503.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { sql } from "drizzle-orm";

export async function GET() {
  // Build the response object incrementally
  const result: {
    status: "ok" | "degraded";
    timestamp: string;
    services: {
      postgres: { status: string; latencyMs: number; error?: string };
      redis:    { status: string; latencyMs: number; error?: string };
    };
  } = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      postgres: { status: "checking", latencyMs: 0 },
      redis:    { status: "checking", latencyMs: 0 },
    },
  };

  // 1. Ping Postgres
  // `sql` is Drizzle's tagged template literal for raw SQL.
  // SELECT 1 just returns the number 1 — the fastest possible round-trip query.
  const pgStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    result.services.postgres = {
      status: "healthy",
      latencyMs: Date.now() - pgStart,
    };
  } catch (err) {
    console.error("Postgres health check failed:", err);
    result.services.postgres = {
      status: "unhealthy",
      latencyMs: Date.now() - pgStart,
      error: err instanceof Error ? err.message : "Unknown error",
    };
    result.status = "degraded";
  }

  // 2. Ping Redis
  // PING is the standard Redis health-check command — the server replies "PONG".
  const redisStart = Date.now();
  try {
    await redis.ping();
    result.services.redis = {
      status: "healthy",
      latencyMs: Date.now() - redisStart,
    };
  } catch (err) {
    console.error("Redis health check failed:", err);
    result.services.redis = {
      status: "unhealthy",
      latencyMs: Date.now() - redisStart,
      error: err instanceof Error ? err.message : "Unknown error",
    };
    result.status = "degraded";
  }

  // Return 200 if both healthy, 503 if either is down
  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 503,
  });
}
