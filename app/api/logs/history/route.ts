/**
 * GET /api/logs/history
 *
 * Returns the last 100 log entries from Redis.
 * Called once on page load so the LogViewer isn't empty while waiting for
 * the first SSE events. Same pattern as /api/metrics/history.
 *
 * Response is an array ordered newest-first.
 * The LogViewer reverses it to show oldest-at-top, newest-at-bottom.
 */

import { NextResponse } from "next/server";
import { getRecentLogs } from "@/lib/logs";

export async function GET() {
  try {
    const logs = await getRecentLogs(100);
    return NextResponse.json(logs);
  } catch (err) {
    console.error("[logs/history]", err);
    return NextResponse.json(
      { error: "Failed to fetch log history" },
      { status: 500 }
    );
  }
}
