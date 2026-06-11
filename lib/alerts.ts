/**
 * The alert evaluation engine. Called from the metrics SSE route every 2 seconds.
 *
 * HOW ALERT EVALUATION WORKS
 *
 * For each active alert rule (e.g. "CPU > 80% for 2 minutes"):
 *
 *   1. DURATION CHECK
 *      Read the last `durationSeconds` of readings from the Redis sorted set
 *      (metrics:cpu, metrics:ram, or metrics:disk - already collected by
 *      lib/metrics.ts). If every reading in that window exceeds the threshold,
 *      the alert is "breaching".
 *
 *   2. ACTIVE STATE
 *      Write the current value to Redis under `alerts:active:<id>`.
 *      This key has a TTL so it auto-expires if the metric recovers.
 *      GET /api/alerts reads these keys to show the "FIRING" badge in the UI.
 *
 *   3. NOTIFICATION (with cooldown)
 *      When an alert first fires (or after the cooldown expires), POST to the
 *      Slack webhook. A separate Redis key `alerts:cooldown:<id>` prevents
 *      re-notifying more than once per 15 minutes for the same rule.
 *
 *   4. DB UPDATE
 *      Update `last_triggered` in Postgres so the UI can show "last fired 5m ago".
 *
 * WHY DURATION-BASED INSTEAD OF INSTANT?
 *
 * CPU spikes to 90% for 1–2 seconds are normal (GC pauses, burst requests).
 * Alerting on every spike would be unbearably noisy. Requiring the threshold
 * to be breached for a continuous window eliminates noise while catching
 * genuine sustained overload.
 */

import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { alerts } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import type { Alert } from "@/drizzle/schema";
import type { MetricSnapshot } from "@/lib/metrics";

const COOLDOWN_SECONDS = 15 * 60; // 15 minutes between Slack notifications

// Duration check
// Returns true only if ALL readings in the last `durationSeconds` exceed
// `threshold`. Requires at least 2 readings and coverage of the full window.
async function isBreachingSustained(
  metric: string,
  threshold: number,
  durationSeconds: number
): Promise<boolean> {
  const now   = Date.now();
  const since = now - durationSeconds * 1_000;

  const raw = await redis.zrange(`metrics:${metric}`, since, "+inf", {
    byScore: true,
  });

  // Need at least 2 readings — 1 reading is not a trend
  if (raw.length < 2) return false;

  const points = raw.map((r) =>
    typeof r === "string" ? (JSON.parse(r) as { value: number; ts: number }) : (r as any)
  );

  // Coverage check: oldest reading must be at least (duration - 15s) ago.
  // 15s tolerance accounts for the case where metrics just started collecting.
  const span = points[points.length - 1].ts - points[0].ts;
  if (span < (durationSeconds - 15) * 1_000) return false;

  // All readings in the window must exceed the threshold
  return points.every((p) => p.value > threshold);
}

// Slack notification
async function sendSlackNotification(
  rule: Alert,
  currentValue: number
): Promise<void> {
  // Use the rule-specific target first, fall back to the env-level webhook
  const webhookUrl =
    rule.channelTarget || process.env.ALERT_SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn(
      `[alerts] Rule "${rule.name}": no Slack webhook configured — set ALERT_SLACK_WEBHOOK_URL`
    );
    return;
  }

  const metricLabel =
    { cpu: "CPU", ram: "RAM", disk: "Disk" }[rule.metric] ??
    rule.metric.toUpperCase();

  const emoji =
    { cpu: "🔥", ram: "📊", disk: "💾" }[rule.metric] ?? "🚨";

  const durationLabel =
    rule.durationSeconds < 60
      ? `${rule.durationSeconds}s`
      : `${Math.round(rule.durationSeconds / 60)}m`;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Fallback text for notifications that can't render blocks
        text: `${emoji} Alert: ${rule.name} - ${metricLabel} at ${currentValue.toFixed(1)}%`,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `${emoji} ${rule.name}`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Metric:*\n${metricLabel}` },
              {
                type: "mrkdwn",
                text: `*Current Value:*\n${currentValue.toFixed(1)}%`,
              },
              {
                type: "mrkdwn",
                text: `*Threshold:*\n> ${rule.threshold}%`,
              },
              {
                type: "mrkdwn",
                text: `*Sustained for:*\n${durationLabel}`,
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `DevOps Monitor · ${new Date().toUTCString()}`,
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error(
        `[alerts] Slack returned ${res.status}: ${await res.text()}`
      );
    }
  } catch (err) {
    console.error("[alerts] Slack request failed:", err);
  }
}

// ── Evaluate one rule ─────────────────────────────────────────────────────────
async function checkRule(
  rule: Alert,
  snapshot: MetricSnapshot
): Promise<void> {
  // Pull the current value for this rule's metric out of the snapshot
  const currentValue =
    snapshot[rule.metric as keyof MetricSnapshot] as number | undefined;

  if (typeof currentValue !== "number") return;

  const breaching = await isBreachingSustained(
    rule.metric,
    rule.threshold,
    rule.durationSeconds
  );

  const activeKey   = `alerts:active:${rule.id}`;
  const cooldownKey = `alerts:cooldown:${rule.id}`;

  if (!breaching) {
    // Alert cleared — remove active marker so the "FIRING" badge disappears
    await redis.del(activeKey);
    return;
  }

  // Mark as actively firing. TTL = duration + 2-minute grace so the badge
  // stays visible briefly even if the metric just dipped below threshold.
  await redis.set(activeKey, currentValue.toFixed(1), {
    ex: rule.durationSeconds + 120,
  });

  // Check cooldown before sending a notification
  const inCooldown = await redis.exists(cooldownKey);
  if (inCooldown) return;

  // --- Outside cooldown: send notification + update DB ---

  if (rule.channel === "slack") {
    await sendSlackNotification(rule, currentValue);
  }

  // Set cooldown so we don't re-notify for 15 minutes
  await redis.set(cooldownKey, "1", { ex: COOLDOWN_SECONDS });

  // Update lastTriggered in Postgres
  await db
    .update(alerts)
    .set({ lastTriggered: new Date() })
    .where(eq(alerts.id, rule.id));

  console.log(
    `[alerts] "${rule.name}" fired — ${rule.metric} at ${currentValue.toFixed(1)}% (threshold ${rule.threshold}%)`
  );
}

// ── PUBLIC: evaluate all active rules ─────────────────────────────────────────
// Called by app/api/metrics/route.ts after each metric collection.
export async function evaluateAlerts(snapshot: MetricSnapshot): Promise<void> {
  // Load only enabled rules — isActive = true
  const rules = await db
    .select()
    .from(alerts)
    .where(eq(alerts.isActive, true));

  if (rules.length === 0) return;

  // Evaluate all rules in parallel — independent of each other
  await Promise.all(rules.map((rule) => checkRule(rule, snapshot)));
}
