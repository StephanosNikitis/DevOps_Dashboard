/**
 * PATCH /api/alerts/:id → toggle isActive or update fields
 * DELETE /api/alerts/:id → remove the rule
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { alerts } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const body = await request.json();

    const [updated] = await db
      .update(alerts)
      .set(body) // accepts any subset of columns: { isActive, threshold, etc. }
      .where(eq(alerts.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    // If the rule was just disabled, clear its active/cooldown Redis keys
    // so the "FIRING" badge disappears immediately in the UI
    if (body.isActive === false) {
      await Promise.all([
        redis.del(`alerts:active:${id}`),
        redis.del(`alerts:cooldown:${id}`),
      ]);
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[alerts] PATCH failed:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    await db.delete(alerts).where(eq(alerts.id, id));

    // Clean up Redis state for this rule
    await Promise.all([
      redis.del(`alerts:active:${id}`),
      redis.del(`alerts:cooldown:${id}`),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[alerts] DELETE failed:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
