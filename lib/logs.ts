/**
 * Handles three things:
 *  1. Generating realistic simulated log entries
 *  2. Writing them to a Redis List (capped at 500 entries)
 *  3. Reading them back for the history endpoint
 *
 * WHY A REDIS LIST INSTEAD OF A SORTED SET?
 * Sorted Sets (used for metrics) are great when you need range queries by score.
 * For logs we just want "the last N entries in insertion order" — a List is the
 * natural Redis data structure for that:
 *
 *   LPUSH logs:stream <entry>    → push newest entry to the HEAD (index 0)
 *   LTRIM logs:stream 0 499      → keep only the 500 newest, drop the rest
 *   LRANGE logs:stream 0 99      → read the 100 newest entries
 *
 * This gives O(1) writes and O(N) reads — exactly what a log tail needs.
 *
 * LOG LEVEL DISTRIBUTION
 * We weight levels to feel realistic: 70% INFO, 20% WARN, 10% ERROR.
 * This makes the ERROR filter meaningful without flooding the screen with red.
 */

import { redis } from "@/lib/redis";

const LOG_CAP = 500; // Max entries to keep in Redis

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  id: string;        // unique: timestamp + random suffix
  level: LogLevel;
  message: string;
  source: string;    // which service generated this log
  timestamp: number; // Unix ms
}

// Realistic log message templates
// Grouped by severity so we can pick randomly within the chosen level.
const TEMPLATES: Record<LogLevel, Array<{ source: string; message: string }>> = {
  INFO: [
    { source: "api-server", message: "GET /api/health 200 OK — 12ms" },
    { source: "api-server", message: "GET /api/metrics 200 OK — 8ms" },
    { source: "api-server", message: "POST /api/deployments 201 Created — 47ms" },
    { source: "api-server", message: "WebSocket client connected from 10.0.0.14" },
    { source: "worker",     message: "Processing job queue — 3 tasks pending" },
    { source: "worker",     message: "Deployment pipeline started: branch=main sha=a3f91c2" },
    { source: "worker",     message: "Email notification dispatched to ops-team@company.com" },
    { source: "docker",     message: "Container api_server_1 health check passed" },
    { source: "docker",     message: "Image pull complete: node:20-alpine (142MB)" },
    { source: "docker",     message: "Container worker_1 started (PID 1842)" },
    { source: "postgres",   message: "Checkpoint completed — 142 buffers written, 0 skipped" },
    { source: "postgres",   message: "Autovacuum: processing table deployments" },
    { source: "redis",      message: "AOF persistence snapshot saved (1.2MB)" },
    { source: "nginx",      message: "SSL certificate renewed — expires in 89 days" },
    { source: "scheduler",  message: "Cron job metrics-cleanup executed successfully" },
    { source: "scheduler",  message: "Scheduled deployment for staging at 02:00 UTC" },
  ],
  WARN: [
    { source: "api-server", message: "Response time exceeded 500ms threshold — 623ms" },
    { source: "api-server", message: "Deprecated endpoint /v1/metrics called — please migrate" },
    { source: "postgres",   message: 'Slow query detected (1247ms): SELECT * FROM deployments WHERE status = \'running\'' },
    { source: "postgres",   message: "Connection pool near limit — 9/10 connections in use" },
    { source: "redis",      message: "Memory usage at 78% of maxmemory — approaching eviction" },
    { source: "docker",     message: "Container worker_2 restarting — exit code 137 (OOM killed)" },
    { source: "worker",     message: "Job retry attempt 2/3 — webhook delivery to GitHub failed" },
    { source: "nginx",      message: "Rate limit triggered for 203.0.113.42 — 450 req/min" },
    { source: "scheduler",  message: "Cron job backup-db missed scheduled window by 2 minutes" },
  ],
  ERROR: [
    { source: "api-server", message: "Unhandled exception: Cannot read properties of undefined (reading 'status')" },
    { source: "postgres",   message: "Connection pool exhausted — all 10 connections in use, rejecting request" },
    { source: "docker",     message: "Failed to pull image node:21-alpine — timeout after 30s" },
    { source: "worker",     message: "Job failed after 3 retries — GitHub webhook endpoint unreachable" },
    { source: "nginx",      message: "Upstream connection refused: api_server:3000 — is the container running?" },
    { source: "redis",      message: "READONLY error — replica instance cannot accept write commands" },
    { source: "scheduler",  message: "Deployment to production FAILED — rollback initiated" },
  ],
};

// Level picker with weighted probability
function pickLevel(): LogLevel {
  const r = Math.random();
  if (r < 0.70) return "INFO";
  if (r < 0.90) return "WARN";
  return "ERROR";
}

// PUBLIC: generate a new log entry
export function generateLogEntry(): LogEntry {
  const level = pickLevel();
  const pool = TEMPLATES[level];
  const template = pool[Math.floor(Math.random() * pool.length)];

  return {
    // Unique ID: timestamp + 5-char random suffix
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    level,
    message: template.message,
    source: template.source,
    timestamp: Date.now(),
  };
}

// PUBLIC: push one entry to Redis (newest at head, capped at LOG_CAP)
export async function pushLog(entry: LogEntry): Promise<void> {
  const serialized = JSON.stringify(entry);

  // LPUSH: insert at the head of the list (index 0 = newest)
  await redis.lpush("logs:stream", serialized);

  // LTRIM: drop everything beyond index (LOG_CAP - 1)
  // This keeps the list bounded — no unbounded memory growth 
  await redis.ltrim("logs:stream", 0, LOG_CAP - 1);
}

// PUBLIC: read the `count` most recent log entries
// Returns entries newest-first (index 0 = most recent).
// The LogViewer reverses this to show chronological order.
export async function getRecentLogs(count = 100): Promise<LogEntry[]> {
  const raw = await redis.lrange("logs:stream", 0, count - 1);
  // Upstash Redis automatically parses JSON by default.
  return raw.map((item) =>
    typeof item === "string" ? (JSON.parse(item) as LogEntry) : (item as LogEntry)
  );
}
