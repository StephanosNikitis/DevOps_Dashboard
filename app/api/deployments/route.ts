/**
 * GET /api/deployments  → last 20 deployments ordered newest-first
 * POST /api/deployments → insert a deployment directly (used by Simulate button)
 *
 * DRIZZLE QUERY PRIMER 
 *
 * Drizzle uses a builder API that mirrors SQL exactly.
 * Reading these queries out loud helps: "select from deployments
 * ordered by triggered_at descending, limit 20".
 *
 *   db.select()               → SELECT *
 *     .from(deployments)      → FROM deployments
 *     .orderBy(desc(...))     → ORDER BY triggered_at DESC
 *     .limit(20)              → LIMIT 20
 *
 *   db.insert(deployments)    → INSERT INTO deployments
 *     .values({ ... })        → VALUES (...)
 *     .returning()            → RETURNING * (gives back the created row)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deployments } from "@/drizzle/schema";
import { desc } from "drizzle-orm";
import type { NewDeployment } from "@/drizzle/schema";

// GET - fetch deployment history 
export async function GET() {
  try {
    const rows = await db
      .select()
      .from(deployments)
      .orderBy(desc(deployments.triggeredAt)) // newest first
      .limit(20);

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[deployments] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch deployments" },
      { status: 500 }
    );
  }
}

// POST - insert a deployment directly
// Used by the PipelinePanel's "Simulate" button to demo the UI without
// needing a real GitHub webhook configured. Also useful for testing.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<NewDeployment>;

    const [created] = await db
      .insert(deployments)
      .values({
        repo:          body.repo          ?? "my-org/api-service",
        branch:        body.branch        ?? "main",
        status:        body.status        ?? "success",
        commitSha:     body.commitSha     ?? null,
        commitMessage: body.commitMessage ?? null,
        triggeredAt:   body.triggeredAt   ? new Date(body.triggeredAt as any) : new Date(),
        finishedAt:    body.finishedAt    ? new Date(body.finishedAt  as any) : null,
      })
      .returning(); // returns the full row including auto-generated id

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[deployments] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to create deployment" },
      { status: 500 }
    );
  }
}