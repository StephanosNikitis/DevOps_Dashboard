/**
 * Responsible for three things:
 *  1. Collecting CPU, RAM, and disk readings
 *  2. Writing them into Redis as a rolling 1-hour time-series
 *  3. Reading history back out of Redis for charts
 *
 * HOW THE REDIS DATA MODEL WORKS
 *
 * Redis key:   metrics:cpu   (also metrics:ram, metrics:disk)
 * Redis type:  Sorted Set
 *
 * A Sorted Set stores a collection of string "members", each with a numeric
 * "score". Members are always kept sorted by score automatically.
 *
 * We use it like this:
 *   score  = Unix timestamp in milliseconds  (e.g. 1717420067101)
 *   member = JSON string                     (e.g. '{"value":45.2,"ts":1717420067101}')
 *
 * Why include `ts` inside the JSON member too?
 *   → Makes every member unique (even if `value` repeats across two readings)
 *   → Lets you parse data back without needing the WITHSCORES Redis flag
 *
 * Key operations we use:
 *   ZADD   → insert a new reading
 *   ZRANGE → read a range of readings by score (timestamp)
 *   ZREMRANGEBYSCORE → delete readings older than 1 hour
 */

import { redis } from "@/lib/redis";
import * as os from "os";

const ONE_HOUR_MS = 60 * 60 * 1000;

// Types
export interface MetricPoint {
  value: number; // percentage 0–100
  ts: number; // Unix timestamp in milliseconds
}

// What the SSE stream sends every 2 seconds
export interface MetricSnapshot {
  cpu: number;
  ram: number;
  disk: number;
  timestamp: number;
}

// What /api/metrics/history returns on page load
export interface MetricsHistory {
  cpu: MetricPoint[];
  ram: MetricPoint[];
  disk: MetricPoint[];
}

// RAM (real data from Node.js)
// Node's built-in `os` module exposes actual host memory figures.
// os.totalmem() = total installed RAM in bytes
// os.freemem()  = currently unused RAM in bytes
function getRealRam(): number {
  const used = os.totalmem() - os.freemem();
  return parseFloat(((used / os.totalmem()) * 100).toFixed(1));
}

// Use local variables instead of Redis for simulation state to save write quota
// let simCpuLast = 35;
// let simDiskLast = 42;

// CPU (simulated realistic random walk)
// Why simulated?
//   On Vercel, each request spins up a fresh serverless function instance.
//   Measuring CPU per-request is meaningless — you'd always get ~0% or ~100%.
//   On a real dedicated server you'd use `systeminformation` npm package or
//   read /proc/stat directly. For this project we simulate instead.
//
// How the simulation works:
//   - Normally drifts ±8% from the previous reading (stays in 20–60% range)
//   - 5% chance per reading of a spike to 80–95% ← triggers anomaly detection
//   - Previous value is stored in Redis so the walk is continuous across requests
//   - UPDATE: Redis writes commented out, using in-memory variables instead.
async function getSimulatedCpu(): Promise<number> {
  const lastRaw = await redis.get<string>("sim:cpu:last");
  const last = lastRaw ? parseFloat(lastRaw) : 35;
  // const last = simCpuLast;

  let next: number;
  if (Math.random() < 0.05) {
    // Spike! (intentional — so we can see anomaly detection fire)
    next = 80 + Math.random() * 15;
  } else {
    // Normal drift
    const delta = (Math.random() - 0.5) * 16;
    next = Math.min(90, Math.max(5, last + delta));
  }

  const rounded = parseFloat(next.toFixed(1));
  await redis.set("sim:cpu:last", String(rounded));
  // simCpuLast = rounded;
  return rounded;
}

// Disk (simulated very slow drift)
// Real disk usage changes over hours/days — almost never moves second-to-second.
// We simulate a slow upward drift (±0.2% per reading) to look realistic.
async function getSimulatedDisk(): Promise<number> {
  const lastRaw = await redis.get<string>("sim:disk:last");
  const last = lastRaw ? parseFloat(lastRaw) : 42;
  // const last = simDiskLast;

  // Slight upward bias: (0.5 - 0.48) * 0.4 = +0.008% average per reading
  const delta = (Math.random() - 0.48) * 0.4;
  const next = Math.min(95, Math.max(10, last + delta));
  const rounded = parseFloat(next.toFixed(1));

  await redis.set("sim:disk:last", String(rounded));
  // simDiskLast = rounded;
  return rounded;
}

// Write one data point to a Redis sorted set
async function storeMetric(key: string, value: number, ts: number) {
  // Member is JSON so it's self-describing and always unique (different ts)
  const member = JSON.stringify({ value, ts });

  // ZADD adds the member with its score (timestamp) to the sorted set
  await redis.zadd(key, { score: ts, member });

  // ZREMRANGEBYSCORE deletes all members with score < (now - 1 hour)
  // This keeps the sorted set bounded to the last 1 hour of readings
  await redis.zremrangebyscore(key, 0, ts - ONE_HOUR_MS);
}

// PUBLIC: collect + store (called by SSE route every 2 seconds)
export async function collectAndStoreMetrics(): Promise<MetricSnapshot> {
  const ts = Date.now();

  // Collect all three in parallel to minimize latency
  const [cpu, disk] = await Promise.all([
    getSimulatedCpu(),
    getSimulatedDisk(),
  ]);
  const ram = getRealRam(); // synchronous, no await needed

  // Write all three to Redis in parallel to save write limit
  await Promise.all([
    storeMetric("metrics:cpu", cpu, ts),
    storeMetric("metrics:ram", ram, ts),
    storeMetric("metrics:disk", disk, ts),
  ]);

  return { cpu, ram, disk, timestamp: ts };
}

// PUBLIC: read last 1 hour from Redis (called by /api/metrics/history)
export async function getMetricsHistory(): Promise<MetricsHistory> {
  const since = Date.now() - ONE_HOUR_MS;

  // ZRANGE with byScore: true returns all members with score between since and +inf
  // This gives us all readings from the last hour, sorted oldest→newest
  const [cpuRaw, ramRaw, diskRaw] = await Promise.all([
    redis.zrange("metrics:cpu", since, "+inf", { byScore: true }),
    redis.zrange("metrics:ram", since, "+inf", { byScore: true }),
    redis.zrange("metrics:disk", since, "+inf", { byScore: true }),
  ]);

  // Upstash Redis automatically parses JSON by default.
  // We check if it's a string just in case it wasn't auto-parsed.
  const parse = (raw: any[]): MetricPoint[] =>
    raw.map((s) => (typeof s === "string" ? JSON.parse(s) : s) as MetricPoint);

  return {
    cpu: parse(cpuRaw),
    ram: parse(ramRaw),
    disk: parse(diskRaw),
  };
}