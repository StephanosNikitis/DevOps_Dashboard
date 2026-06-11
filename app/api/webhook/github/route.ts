/**
 * POST /api/webhook/github
 *
 * Receives GitHub Actions webhook events and stores them in Postgres.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { deployments } from "@/drizzle/schema";

// Status mapping 
// GitHub uses `status` + `conclusion` together to represent the full state.
// We collapse them into our four-value status enum.
//
// GitHub status values:    "queued" | "in_progress" | "completed"
// GitHub conclusion values (only set when status=completed):
//   "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required"
function mapGitHubStatus(
  status: string,
  conclusion: string | null
): "pending" | "running" | "success" | "failed" {
  if (status === "queued")       return "pending";
  if (status === "in_progress")  return "running";
  if (status === "completed" && conclusion === "success") return "success";
  if (status === "completed")    return "failed";
  return "pending";
}

// Signature verification 
function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const sigBuf      = Buffer.from(signatureHeader, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// Route handler 
export async function POST(request: NextRequest) {
  // Read body as raw text first — signature must be verified against original bytes
  const rawBody = await request.text();

  // 1. Verify signature (skip if secret not configured — for local dev)
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const isValid = verifySignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      secret
    );
    if (!isValid) {
      console.warn("[webhook] Invalid signature — request rejected");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("[webhook] GITHUB_WEBHOOK_SECRET not set — skipping verification");
  }

  const eventType = request.headers.get("x-github-event");

  // 2. Handle ping (GitHub sends this when you first save the webhook)
  if (eventType === "ping") {
    return NextResponse.json({ message: "pong" });
  }

  // 3. Ignore everything except workflow_run
  if (eventType !== "workflow_run") {
    return NextResponse.json({ message: `Event '${eventType}' ignored` });
  }

  // 4. Parse and store
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workflow_run, repository } = payload;

  if (!workflow_run || !repository) {
    return NextResponse.json(
      { error: "Missing workflow_run or repository fields" },
      { status: 400 }
    );
  }

  const deploymentStatus = mapGitHubStatus(
    workflow_run.status,
    workflow_run.conclusion ?? null
  );

  try {
    await db.insert(deployments).values({
      repo:          repository.full_name,
      branch:        workflow_run.head_branch ?? "unknown",
      status:        deploymentStatus,
      commitSha:     workflow_run.head_sha?.slice(0, 7) ?? null,
      commitMessage: workflow_run.head_commit?.message?.split("\n")[0]?.slice(0, 120) ?? null,
      triggeredAt:   new Date(workflow_run.created_at),
      finishedAt:    workflow_run.conclusion ? new Date(workflow_run.updated_at) : null,
    });

    console.log(
      `[webhook] ${repository.full_name}@${workflow_run.head_branch} → ${deploymentStatus}`
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] DB insert failed:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
