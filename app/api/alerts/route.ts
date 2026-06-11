/**
 * GET /api/alerts  → all rules + which ones are currently firing
 * POST /api/alerts → create a new alert rule
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { alerts } from "@/drizzle/schema";
import { asc } from "drizzle-orm";
import type { NewAlert } from "@/drizzle/schema";

// GET - list all rules and live firing state
export async function GET() {
  try {
    const rules = await db
      .select()
      .from(alerts)
      .orderBy(asc(alerts.createdAt));

    // Check Redis for each rule's active state.
    // `alerts:active:<id>` is set by lib/alerts.ts when a rule is firing
    // and expires automatically when the alert clears.
    const firingEntries = await Promise.all(
      rules.map(async (rule) => {
        const val = await redis.get<string>(`alerts:active:${rule.id}`);
        return [rule.id, val] as [number, string | null];
      })
    );

    // Build a map: { ruleId → currentValue | null }
    const firing: Record<number, string | null> = Object.fromEntries(
      firingEntries.map(([id, val]) => [id, val])
    );

    return NextResponse.json({ rules, firing });
  } catch (err) {
    console.error("[alerts] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

// POST - create a new alert rule
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<NewAlert>;

    if (!body.name || !body.metric || body.threshold == null) {
      return NextResponse.json(
        { error: "name, metric, and threshold are required" },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(alerts)
      .values({
        name:            body.name,
        metric:          body.metric,
        threshold:       Number(body.threshold),
        durationSeconds: Number(body.durationSeconds ?? 120),
        channel:         body.channel ?? "slack",
        channelTarget:   body.channelTarget ?? null,
        isActive:        body.isActive ?? true,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[alerts] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to create alert rule" },
      { status: 500 }
    );
  }
}