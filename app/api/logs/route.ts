/**
 * GET /api/logs
 *
 * SSE stream that pushes one new log entry at random intervals (0.8 – 3 seconds).
 * The variable delay makes it feel like real application logs rather than a metronome.
 *
 * Each SSE event is a JSON-serialized LogEntry:
 *   data: {"id":"...","level":"WARN","message":"...","source":"nginx","timestamp":...}\n\n
 */

import { NextRequest } from "next/server";
import { generateLogEntry, pushLog } from "@/lib/logs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send first entry immediately
      try {
        const entry = generateLogEntry();
        await pushLog(entry);
        send(entry);
      } catch (err) {
        console.error("[logs SSE] Initial entry failed:", err);
        controller.close();
        return;
      }

      let alive = true;
      request.signal.addEventListener("abort", () => {
        alive = false;
        try { controller.close(); } catch {}
      });

      while (alive) {
        // Random interval: 800ms – 3000ms  (real logs don't tick like a clock)
        const delay = 800 + Math.random() * 2200;
        await new Promise((r) => setTimeout(r, delay));
        if (!alive) break;

        try {
          const entry = generateLogEntry();
          await pushLog(entry);
          send(entry);
        } catch {
          alive = false;
          try { controller.close(); } catch {}
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}