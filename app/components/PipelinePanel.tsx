"use client";

/**
 * Displays CI/CD pipeline history as a scrollable list of deployment cards.
 *
 * FEATURES
 * - Loads last 20 deployments from Postgres on mount
 * - Polls for updates every 10 seconds (catches webhooks arriving mid-session)
 * - "Simulate" button: generates a realistic deployment and POSTs it to the API,
 *   so you can demo the panel without a real GitHub webhook configured
 * - Status filter: ALL / RUNNING / SUCCESS / FAILED
 * - Each card: repo, branch, commit sha + message, status badge, time ago, duration
 * - RUNNING deployments show a pulsing blue left border
 *
 * DATA SOURCE
 * Real data comes from GitHub via POST /api/webhook/github → Postgres.
 * Demo data comes from clicking "Simulate" → POST /api/deployments → Postgres.
 * Both end up in the same table and are displayed identically.
 */

import { useState, useEffect, useCallback } from "react";
import type { Deployment } from "@/drizzle/schema";

// Dates come back as ISO strings from JSON.parse, not Date objects
type DeploymentRow = Omit<Deployment, "triggeredAt" | "finishedAt"> & {
  triggeredAt: string;
  finishedAt: string | null;
};

type StatusFilter = "ALL" | "running" | "success" | "failed";

// Status config
const STATUS = {
  pending: {
    label:  "PENDING",
    border: "border-l-slate-600",
    badge:  "text-slate-400 bg-slate-900/50 border-slate-700/40",
    dot:    "bg-slate-400",
  },
  running: {
    label:  "RUNNING",
    border: "border-l-blue-500",
    badge:  "text-blue-400 bg-blue-950/50 border-blue-800/40",
    dot:    "bg-blue-400 animate-pulse",
  },
  success: {
    label:  "SUCCESS",
    border: "border-l-emerald-500",
    badge:  "text-emerald-400 bg-emerald-950/50 border-emerald-800/40",
    dot:    "bg-emerald-400",
  },
  failed: {
    label:  "FAILED",
    border: "border-l-red-500",
    badge:  "text-red-400 bg-red-950/50 border-red-800/40",
    dot:    "bg-red-400",
  },
} as const;

// Time helpers
function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs <    60) return `${secs}s ago`;
  if (secs <  3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function elapsed(start: string, end: string): string {
  const secs = Math.floor(
    (new Date(end).getTime() - new Date(start).getTime()) / 1000
  );
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if(mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h`;
}

// 'Simulate data 
const REPOS    = ["my-org/api-service", "my-org/frontend", "my-org/worker", "my-org/infra"];
const BRANCHES = ["main", "develop", "release/v2.1", "feature/auth-refactor", "fix/memory-leak"];
const MESSAGES = [
  "feat: add real-time metrics SSE endpoint",
  "fix: resolve memory leak in job worker",
  "chore: upgrade Node.js to v20 LTS",
  "feat: implement Slack alert notifications",
  "fix: correct CORS headers for streaming routes",
  "refactor: extract Redis client into lib/redis.ts",
  "ci: add integration tests for webhook handler",
  "docs: update API reference with new endpoints",
  "perf: add connection pooling for Postgres",
  "feat: implement anomaly detection algorithm",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSha(): string {
  return Math.random().toString(16).slice(2, 9);
}

function buildSimulatedDeployment() {
  const r = Math.random();
  // Weighted: 60% success, 25% failed, 15% running
  const status: DeploymentRow["status"] =
    r < 0.60 ? "success" : r < 0.85 ? "failed" : "running";

  const triggeredAt = new Date(
    Date.now() - Math.floor(Math.random() * 3_600_000) // within last hour
  );
  // Duration: 30 seconds to 5 minutes
  const runMs = 30_000 + Math.random() * 270_000;
  const finishedAt =
    status !== "running" ? new Date(triggeredAt.getTime() + runMs) : null;

  return {
    repo:          randomItem(REPOS),
    branch:        randomItem(BRANCHES),
    status,
    commitSha:     randomSha(),
    commitMessage: randomItem(MESSAGES),
    triggeredAt:   triggeredAt.toISOString(),
    finishedAt:    finishedAt?.toISOString() ?? null,
  };
}

function DeploymentCard({ row }: { row: DeploymentRow }) {
  const cfg = STATUS[row.status as keyof typeof STATUS] ?? STATUS.pending;

  return (
    <div
      className={`border-l-2 ${cfg.border} bg-base/60 hover:bg-white/[0.02] transition-colors px-4 py-3`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-jetbrains text-[11px] text-[#e6edf3] font-medium truncate">
              {row.repo}
            </span>
            <span className="font-jetbrains text-[10px] text-muted shrink-0">
              : {row.branch}
            </span>
          </div>

          {row.commitSha && (
            <div className="flex items-center gap-1.5">
              <span className="font-jetbrains text-[10px] text-[#484f58] font-mono">
                {row.commitSha}
              </span>
              {row.commitMessage && (
                <span className="font-jetbrains text-[10px] text-muted truncate">
                  — {row.commitMessage}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`font-jetbrains text-[9px] font-semibold tracking-wider px-2 py-0.5 rounded border ${cfg.badge}`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${cfg.dot}`} />
            {cfg.label}
          </span>

          <div className="flex items-center gap-2 font-jetbrains text-[10px] text-[#484f58]">
            <span>{timeAgo(row.triggeredAt)}</span>
            {row.finishedAt && (
              <>
                <span>·</span>
                <span>{elapsed(row.triggeredAt, row.finishedAt)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center px-6">
      <p className="font-rajdhani text-[11px] tracking-[0.2em] text-muted uppercase mb-3">
        No deployments yet
      </p>
      <p className="font-jetbrains text-[10px] text-[#484f58] leading-relaxed max-w-xs">
        Click <span className="text-muted">Simulate</span> to add test data, or configure a GitHub
        webhook pointing to <span className="text-[#e6edf3]/60">/api/webhook/github</span>.
      </p>
    </div>
  );
}

// Main component 
export default function PipelinePanel() {
  const [rows, setRows] = useState<DeploymentRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch from Postgres
  const fetchDeployments = useCallback(async () => {
    try {
      const res = await fetch("/api/deployments");
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[pipeline] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount, then poll every 10 seconds
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
        if(!isMounted) return;
        await fetchDeployments();
        timeoutId = setTimeout(poll, 10_000); // Schedule next poll only after this one finishes
    }

    poll();

    return () => {
        isMounted = false;
        clearTimeout(timeoutId);
    }
  }, [fetchDeployments]);

  // Simulate a deployment
  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const payload = buildSimulatedDeployment();
      const res = await fetch("/api/deployments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (res.ok) {
        const created: DeploymentRow = await res.json();
        // Prepend the new deployment so it appears at the top immediately
        setRows((prev) => [created, ...prev].slice(0, 20));
        setLastUpdated(new Date());
      }
    } finally {
      setSimulating(false);
    }
  };

  // Filter
  const filtered = rows.filter(
    (r) => filter === "ALL" || r.status === filter
  );

  // Status counts for filter button badges
  const counts = rows.reduce(
    (acc, r) => {
      const s = r.status as StatusFilter;
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<StatusFilter, number>>
  );

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <p className="font-rajdhani text-[10px] tracking-[0.25em] text-muted uppercase">
            CI/CD Pipelines
          </p>
          {lastUpdated && (
            <span className="font-jetbrains text-[9px] text-[#484f58]">
              updated {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchDeployments}
            className="font-jetbrains text-[10px] text-muted hover:text-[#e6edf3] transition-colors px-2 py-1"
            title="Refresh"
          >
            ↺
          </button>

          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="font-jetbrains text-[10px] px-3 py-1.5 rounded border border-border text-muted hover:text-[#e6edf3] hover:border-[#30363d] transition-colors disabled:opacity-40"
          >
            {simulating ? "Adding…" : "+ Simulate"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-base/40">
        {(["ALL", "running", "success", "failed"] as StatusFilter[]).map(
          (f) => {
            const cfg = f !== "ALL" ? STATUS[f] : null;
            const isActive = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`font-jetbrains text-[10px] px-2.5 py-1 rounded border transition-colors ${
                  isActive
                    ? f === "ALL"
                      ? "bg-[#21262d] border-[#30363d] text-[#e6edf3]"
                      : cfg?.badge
                    : "bg-transparent border-border text-muted hover:border-[#30363d] hover:text-[#e6edf3]"
                }`}
              >
                {f.toUpperCase()}
                {f !== "ALL" && counts[f] != null && (
                  <span className="ml-1.5 opacity-60">{counts[f]}</span>
                )}
              </button>
            );
          }
        )}
      </div>

      <div
        className="h-80 overflow-y-auto divide-y divide-border/50"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#21262d transparent" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full font-jetbrains text-[11px] text-muted">
            Loading deployments…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((row) => <DeploymentCard key={row.id} row={row} />)
        )}
      </div>

      <div className="px-4 py-2 border-t border-border bg-base/40">
        <p className="font-jetbrains text-[9px] text-[#484f58]">
          Real data: GitHub → Settings → Webhooks → Payload URL:{" "}
          <span className="text-[#e6edf3]/40">/api/webhook/github</span>
          {" "}· Events: Workflow runs
        </p>
      </div>
    </div>
  );
}
