"use client";

/**
 * UI for managing alert rules and seeing which ones are currently firing.
 *
 * Firing Alerts (red section, only shown when alerts are active)
 * High CPU Warning — CPU at 91.4%                              
 * 
 *  Rules list
 *  CPU > 80% for 2m · Slack  ACTIVE  [pause]  [delete]    
 *  RAM > 85% for 2m · Slack  PAUSED  [resume] [delete]    
 *
 * POLLING
 * Polls GET /api/alerts every 5 seconds so the "FIRING" badges update
 * promptly when the lib/alerts.ts evaluator fires or clears a rule.
 */

import { useState, useEffect, useCallback } from "react";
import type { Alert } from "@/drizzle/schema";

// Date fields come back as ISO strings from JSON
type AlertRow = Omit<Alert, "lastTriggered" | "createdAt"> & {
  lastTriggered: string | null;
  createdAt: string;
};

interface AlertsResponse {
  rules:  AlertRow[];
  firing: Record<number, string | null>; // ruleId - current value string | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function durationLabel(secs: number): string {
  if (secs < 60) return `${secs}s`;
  return `${Math.round(secs / 60)}m`;
}

const METRIC_LABELS: Record<string, string> = {
  cpu: "CPU", ram: "RAM", disk: "Disk",
};

// Add Rule Form
interface AddRuleFormProps {
  onSave: (rule: AlertRow) => void;
  onCancel: () => void;
}

function AddRuleForm({ onSave, onCancel }: AddRuleFormProps) {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("cpu");
  const [threshold, setThreshold] = useState(80);
  const [duration, setDuration] = useState(120);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) { setError("Rule name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/alerts", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), metric, threshold, durationSeconds: duration, channel: "slack" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created: AlertRow = await res.json();
      onSave(created);
    } catch {
      setError("Failed to save rule — check the console");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full font-jetbrains text-[11px] bg-base border border-border rounded px-2.5 py-1.5 text-[#e6edf3] focus:outline-none focus:border-[#30363d] transition-colors";
  const selectCls = inputCls + " cursor-pointer";
  const labelCls = "font-jetbrains text-[10px] text-muted block mb-1";

  return (
    <div className="border-t border-border p-4 bg-base/40">
      <p className="font-rajdhani text-[10px] tracking-[0.2em] text-muted uppercase mb-3">
        New Alert Rule
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">

        <div>
          <label className={labelCls}>Metric</label>
          <select value={metric} onChange={e => setMetric(e.target.value)} className={selectCls}>
            <option value="cpu">CPU</option>
            <option value="ram">RAM</option>
            <option value="disk">Disk</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Threshold (%)</label>
          <input
            type="number" min={1} max={99} value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Duration</label>
          <select value={duration} onChange={e => setDuration(Number(e.target.value))} className={selectCls}>
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={120}>2 minutes</option>
            <option value={300}>5 minutes</option>
            <option value={600}>10 minutes</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Channel</label>
          <select className={selectCls} disabled>
            <option>Slack</option>
          </select>
        </div>
      </div>

      <div className="mb-3">
        <label className={labelCls}>Rule Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          placeholder={`e.g. High ${METRIC_LABELS[metric]} Warning`}
          className={inputCls}
        />
      </div>

      {error && (
        <p className="font-jetbrains text-[10px] text-red-400 mb-2">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="font-jetbrains text-[10px] px-3 py-1.5 rounded bg-sky-900/40 border border-sky-700/40 text-sky-400 hover:bg-sky-900/60 transition-colors disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save Rule"}
        </button>
        <button
          onClick={onCancel}
          className="font-jetbrains text-[10px] px-3 py-1.5 rounded border border-border text-muted hover:text-[#e6edf3] hover:border-[#30363d] transition-colors"
        >
          Cancel
        </button>
        <p className="font-jetbrains text-[9px] text-[#484f58] ml-1">
          Notifications use ALERT_SLACK_WEBHOOK_URL from your env
        </p>
      </div>
    </div>
  );
}

// Rule card 
interface RuleCardProps {
  rule: AlertRow;
  firingValue: string | null;
  onToggle: (id: number, isActive: boolean) => void;
  onDelete: (id: number) => void;
}

function RuleCard({ rule, firingValue, onToggle, onDelete }: RuleCardProps) {
  const isFiring = firingValue !== null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-l-2 transition-colors ${
        isFiring
          ? "border-l-red-500 bg-red-950/10"
          : rule.isActive
          ? "border-l-emerald-700 bg-base/40"
          : "border-l-[#21262d] bg-base/20"
      } hover:bg-white/[0.02]`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-jetbrains text-[11px] text-[#e6edf3] font-medium">
            {rule.name}
          </span>

          {isFiring && (
            <span className="font-jetbrains text-[9px] font-bold tracking-wider px-2 py-px rounded-full bg-red-950/60 border border-red-800/40 text-red-400 animate-pulse">
              ● FIRING {firingValue}%
            </span>
          )}
        </div>

        <p className="font-jetbrains text-[10px] text-muted mt-0.5">
          {METRIC_LABELS[rule.metric] ?? rule.metric} &gt; {rule.threshold}% for{" "}
          {durationLabel(rule.durationSeconds)} · {rule.channel}
          {" · "}
          <span className="text-[#484f58]">
            triggered {timeAgo(rule.lastTriggered)}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`font-jetbrains text-[9px] tracking-wider px-2 py-px rounded-full border ${
            rule.isActive
              ? "text-emerald-400 bg-emerald-950/30 border-emerald-800/30"
              : "text-muted bg-[#21262d]/50 border-border"
          }`}
        >
          {rule.isActive ? "ACTIVE" : "PAUSED"}
        </span>

        <button
          onClick={() => onToggle(rule.id, !rule.isActive)}
          title={rule.isActive ? "Pause rule" : "Resume rule"}
          className="font-jetbrains text-[11px] text-muted hover:text-[#e6edf3] transition-colors w-6 text-center"
        >
          {rule.isActive ? "⏸" : "▶"}
        </button>

        <button
          onClick={() => onDelete(rule.id)}
          title="Delete rule"
          className="font-jetbrains text-[11px] text-muted hover:text-red-400 transition-colors w-6 text-center"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function AlertPanel() {
  const [data,       setData]       = useState<AlertsResponse | null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [loading,    setLoading]    = useState(true);

  // Fetch rules + firing state
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const json: AlertsResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error("[AlertPanel] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount; poll every 5 seconds to catch newly firing/cleared alerts
  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 5_000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  // Toggle active/paused 
  const handleToggle = async (id: number, isActive: boolean) => {
    // Optimistic update
    setData((prev) =>
      prev
        ? {
            ...prev,
            rules: prev.rules.map((r) =>
              r.id === id ? { ...r, isActive } : r
            ),
          }
        : prev
    );
    try {
      await fetch(`/api/alerts/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
    } catch {
      fetchAlerts(); // roll back on failure
    }
  };

  // Delete
  const handleDelete = async (id: number) => {
    setData((prev) =>
      prev ? { ...prev, rules: prev.rules.filter((r) => r.id !== id) } : prev
    );
    try {
      await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    } catch {
      fetchAlerts();
    }
  };

  // After saving a new rule
  const handleSaved = (rule: AlertRow) => {
    setData((prev) =>
      prev
        ? { ...prev, rules: [...prev.rules, rule] }
        : { rules: [rule], firing: {} }
    );
    setShowForm(false);
  };

  const firingRules = data?.rules.filter((r) => data.firing[r.id] !== null && data.firing[r.id] !== undefined) ?? [];

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <p className="font-rajdhani text-[10px] tracking-[0.25em] text-muted uppercase">
            Alert Rules
          </p>
          {data && (
            <span className="font-jetbrains text-[10px] text-muted">
              {data.rules.filter((r) => r.isActive).length} active
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="font-jetbrains text-[10px] px-3 py-1.5 rounded border border-border text-muted hover:text-[#e6edf3] hover:border-[#30363d] transition-colors"
        >
          {showForm ? "✕ Cancel" : "+ Add Rule"}
        </button>
      </div>

      {firingRules.length > 0 && (
        <div className="bg-red-950/20 border-b border-red-900/30 px-4 py-2.5">
          <p className="font-rajdhani text-[9px] tracking-[0.2em] text-red-500 uppercase mb-1.5">
            ⚠ Firing Now
          </p>
          <div className="space-y-1">
            {firingRules.map((r) => (
              <p key={r.id} className="font-jetbrains text-[11px] text-red-300">
                <span className="text-red-500 mr-2">●</span>
                {r.name} —{" "}
                {METRIC_LABELS[r.metric]} at{" "}
                <span className="font-bold">{data?.firing[r.id]}%</span>
                {" "}(threshold {r.threshold}%)
              </p>
            ))}
          </div>
        </div>
      )}

      <div
        className="divide-y divide-border/50 max-h-64 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#21262d transparent" }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-24 font-jetbrains text-[11px] text-muted">
            Loading rules…
          </div>
        ) : !data || data.rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-center px-6">
            <p className="font-jetbrains text-[10px] text-[#484f58]">
              No alert rules yet — click{" "}
              <button
                onClick={() => setShowForm(true)}
                className="text-muted hover:text-[#e6edf3] underline underline-offset-2"
              >
                + Add Rule
              </button>{" "}
              to create one.
            </p>
          </div>
        ) : (
          data.rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              firingValue={data.firing[rule.id] ?? null}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {showForm && (
        <AddRuleForm
          onSave={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
