/**
 * GET /api/metrics/history
 *
 * Returns up to the last 1 hour of metric readings from Redis.
 *
 * WHY THIS ENDPOINT EXISTS
 * When a user opens the dashboard, the SSE stream only delivers NEW readings
 * going forward. Without this endpoint, the charts would start empty and
 * slowly fill in — poor UX.
 *
 * The pattern is:
 *   1. Page loads → fetch /api/metrics/history → pre-populate charts with history
 *   2. Connect to SSE stream → append new points as they arrive every 2 seconds
 *
 * Example response:
 * {
 *   "cpu":  [{ "value": 45.2, "ts": 1717420067101 }, ...],
 *   "ram":  [{ "value": 63.1, "ts": 1717420067101 }, ...],
 *   "disk": [{ "value": 42.0, "ts": 1717420067101 }, ...]
 * }
 *
 * Points are ordered oldest → newest (chronological).
 * If the server just started there will be fewer than 1 hour of points.
 */

import { NextResponse } from "next/server";
import { getMetricsHistory } from "@/lib/metrics";

export async function GET() {
  try {
    const history = await getMetricsHistory();
    return NextResponse.json(history);
  } catch (err) {
    console.error("[metrics/history] Failed to read from Redis:", err);
    return NextResponse.json(
      { error: "Failed to fetch metrics history" },
      { status: 500 }
    );
  }
}
