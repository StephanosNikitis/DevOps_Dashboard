/**
 * We do NOT await evaluateAlerts — we let it run in parallel with sending
 * the SSE event. This keeps the 2-second cadence tight and ensures that a
 * slow Postgres query or failed Slack call never blocks the metrics stream.
 */

import { NextRequest } from "next/server";
import { collectAndStoreMetrics } from "@/lib/metrics";
import { evaluateAlerts } from "@/lib/alerts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send first metric immediately
      try {
        const metrics = await collectAndStoreMetrics();
        // Fire alert evaluation - don't await so it doesn't block the first event
        evaluateAlerts(metrics).catch((err) =>
          console.error("[SSE] Alert evaluation failed:", err)
        );
        send(metrics);
      } catch (err) {
        console.error("[SSE] Initial collection failed:", err);
        controller.close();
        return;
      }

      let alive = true;

      request.signal.addEventListener("abort", () => {
        alive = false;
        try { controller.close(); } catch {}
      });

      while (alive) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!alive) break;

        try {
          const metrics = await collectAndStoreMetrics();
          // Evaluate alerts in background — failures are logged, not thrown
          evaluateAlerts(metrics).catch((err) =>
            console.error("[SSE] Alert evaluation failed:", err)
          );
          send(metrics);
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
