"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface LiveMetrics {
  cpu:  number | null;
  ram:  number | null;
  disk: number | null;
}

function useCountUp(target: number | null, ms = 900): number | null {
  const [display, setDisplay] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (target === null) return;
    const steps  = 40;
    const delay  = ms / steps;
    let current  = 0;

    if (timer.current !== null) clearInterval(timer.current);
    timer.current = setInterval(() => {
      current += target / steps;
      if (current >= target) {
        setDisplay(target);
        if (timer.current !== null) clearInterval(timer.current);
      } else {
        setDisplay(parseFloat(current.toFixed(1)));
      }
    }, delay);

    return () => {
      if (timer.current !== null) clearInterval(timer.current);
    };
  }, [target, ms]);

  return display;
}

function MetricCard({
  label,
  value,
  color,
  glowColor,
}: {
  label: string;
  value: number | null;
  color: string;
  glowColor: string;
}) {
  const animated = useCountUp(value);

  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded-lg px-4 py-4 flex-1">
      <p className="font-rajdhani text-[9px] tracking-[0.25em] text-[#8b949e] uppercase mb-2">
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        <span
          className="font-jetbrains text-3xl font-bold tabular-nums leading-none"
          style={{
            color,
            textShadow: animated !== null ? `0 0 20px ${glowColor}` : "none",
            transition: "text-shadow 0.3s",
          }}
        >
          {animated !== null ? animated.toFixed(1) : "—"}
        </span>
        <span className="font-jetbrains text-[#8b949e] text-xs">%</span>
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  body,
  tag,
}: {
  title: string;
  body: string;
  tag: string;
}) {
  return (
    <div className="border border-[#21262d] rounded-xl p-5 hover:border-[#30363d] transition-colors group">
      <p className="font-jetbrains text-[9px] text-[#484f58] tracking-widest uppercase mb-3 group-hover:text-[#8b949e] transition-colors">
        {tag}
      </p>
      <p className="font-rajdhani text-base font-semibold text-[#e6edf3] mb-2">
        {title}
      </p>
      <p className="font-jetbrains text-[11px] text-[#8b949e] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function FlowStep({
  label,
  detail,
  color,
}: {
  label: string;
  detail: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-1.5 px-3">
      <div
        className="w-2 h-2 rounded-full mb-1"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
      <p
        className="font-jetbrains text-[11px] font-semibold"
        style={{ color }}
      >
        {label}
      </p>
      <p className="font-jetbrains text-[10px] text-[#484f58] max-w-[90px] leading-relaxed">
        {detail}
      </p>
    </div>
  );
}

export default function HomePage() {
  const [metrics, setMetrics] = useState<LiveMetrics>({
    cpu: null, ram: null, disk: null,
  });
  const [systemLive, setSystemLive] = useState(false);

  // Fetch one snapshot of real metrics on mount
  useEffect(() => {
    fetch("/api/metrics/history")
      .then((r) => r.json())
      .then((h: { cpu: {value:number}[]; ram: {value:number}[]; disk: {value:number}[] }) => {
        const last = <T extends {value: number}>(arr: T[]) =>
          arr.length > 0 ? arr[arr.length - 1].value : null;
        setMetrics({ cpu: last(h.cpu), ram: last(h.ram), disk: last(h.disk) });
        setSystemLive(h.cpu.length > 0);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#e6edf3]">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #21262d 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.4,
        }}
      />

      <nav className="relative z-10 border-b border-[#21262d] bg-[#0a0e1a]/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">

          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
              <polygon
                points="11,2 20,7 20,15 11,20 2,15 2,7"
                stroke="#38bdf8" strokeWidth="1.5" fill="none"
              />
              <polygon
                points="11,6 16,9 16,13 11,16 6,13 6,9"
                fill="#38bdf8" fillOpacity="0.2"
              />
            </svg>
            <span className="font-rajdhani text-sm font-semibold tracking-[0.18em] uppercase text-[#e6edf3]">
              DevOps Monitor
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/StephanosNikitis/DevOps_Dashboard"
              target="_blank"
              rel="noreferrer"
              className="font-jetbrains text-[11px] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
            >
              GitHub 
            </a>
            <Link
              href="/dashboard"
              className="font-jetbrains text-[11px] px-4 py-2 rounded-lg bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[#38bdf8] hover:bg-[#38bdf8]/20 hover:border-[#38bdf8]/50 transition-all"
            >
              Open Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-20 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-16 items-center">

          <div>
            <p className="font-jetbrains text-[10px] tracking-[0.3em] text-[#8b949e] uppercase mb-6">
              Real-time · DevOps · Monitoring
            </p>

            <h1 className="font-rajdhani font-bold leading-[1.05] mb-6">
              <span className="block text-[4rem] lg:text-[5rem] text-[#e6edf3]">
                Your stack,
              </span>
              <span
                className="block text-[4rem] lg:text-[5rem]"
                style={{ color: "#38bdf8", textShadow: "0 0 40px rgba(56,189,248,0.25)" }}
              >
                watched live.
              </span>
            </h1>

            <p className="font-jetbrains text-[13px] text-[#8b949e] leading-relaxed mb-10 max-w-md">
              Metrics, logs, deployments and alerts — unified in one dashboard,
              streaming over SSE, stored in Redis and Postgres. Built without
              Datadog.
            </p>

            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="font-rajdhani font-semibold text-sm tracking-wider uppercase px-6 py-3 rounded-lg bg-[#38bdf8] text-[#0a0e1a] hover:bg-[#7dd3fc] transition-colors"
              >
                Open Dashboard
              </Link>
              <a
                href="https://github.com/StephanosNikitis/DevOps_Dashboard"
                target="_blank"
                rel="noreferrer"
                className="font-rajdhani font-semibold text-sm tracking-wider uppercase px-6 py-3 rounded-lg border border-[#21262d] text-[#8b949e] hover:text-[#e6edf3] hover:border-[#30363d] transition-colors"
              >
                View on GitHub
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="bg-[#0d1117]/90 border border-[#21262d] rounded-2xl p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="font-rajdhani text-[10px] tracking-[0.2em] text-[#8b949e] uppercase">
                  Server Metrics
                </p>
                <div
                  className={`flex items-center gap-1.5 font-jetbrains text-[10px] ${
                    systemLive ? "text-emerald-400" : "text-[#484f58]"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      systemLive ? "bg-emerald-400 animate-pulse" : "bg-[#484f58]"
                    }`}
                  />
                  {systemLive ? "LIVE" : "WAITING FOR DATA"}
                </div>
              </div>

              <div className="flex gap-3 mb-5">
                <MetricCard
                  label="CPU"  value={metrics.cpu}
                  color="#38bdf8" glowColor="rgba(56,189,248,0.4)"
                />
                <MetricCard
                  label="RAM"  value={metrics.ram}
                  color="#4ade80" glowColor="rgba(74,222,128,0.4)"
                />
                <MetricCard
                  label="Disk" value={metrics.disk}
                  color="#fb923c" glowColor="rgba(251,146,60,0.4)"
                />
              </div>

              <div className="space-y-2">
                {[
                  { label: "api-server", pct: 72, color: "#a78bfa" },
                  { label: "worker",     pct: 45, color: "#34d399" },
                  { label: "postgres",   pct: 31, color: "#f472b6" },
                ].map(({ label, pct, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span
                      className="font-jetbrains text-[10px] w-20 shrink-0"
                      style={{ color }}
                    >
                      {label}
                    </span>
                    <div className="flex-1 bg-[#21262d] rounded-full h-1">
                      <div
                        className="h-1 rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
                      />
                    </div>
                    <span className="font-jetbrains text-[10px] text-[#484f58] w-8 text-right">
                      {pct}%
                    </span>
                  </div>
                ))}
              </div>

              <p className="font-jetbrains text-[9px] text-[#484f58] mt-4">
                {systemLive
                  ? "↑ Real values from the running system · updates every 2s"
                  : "Start npm run dev and open /dashboard to begin collecting data"}
              </p>
            </div>

            <div
              className="absolute -inset-4 rounded-3xl blur-3xl -z-10 opacity-20"
              style={{ background: "radial-gradient(ellipse, #38bdf8, transparent 70%)" }}
            />
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-[#21262d] bg-[#0d1117]/60">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="font-rajdhani text-[10px] tracking-[0.3em] text-[#8b949e] uppercase text-center mb-10">
            How it works
          </p>

          <div className="flex flex-wrap items-start justify-center gap-0">
            {[
              { label: "Agent",    detail: "Collects CPU, RAM, disk every 2s",     color: "#38bdf8" },
              { label: "Redis",    detail: "Sorted set time-series, 1-hour window", color: "#4ade80" },
              { label: "SSE",      detail: "Persistent stream to the browser",      color: "#fb923c" },
              { label: "Browser",  detail: "Charts update without any polling",     color: "#a78bfa" },
            ].map((step, i) => (
              <div key={step.label} className="flex items-start">
                <FlowStep {...step} />
                {i < 3 && (
                  <span className="font-jetbrains text-[#21262d] text-lg mt-2 mx-1 select-none">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-start justify-center gap-0 mt-6">
            {[
              { label: "GitHub",   detail: "Sends signed workflow_run event",      color: "#f472b6" },
              { label: "Webhook",  detail: "HMAC-verified, stored in Postgres",    color: "#fbbf24" },
              { label: "Alerts",   detail: "Duration-based threshold evaluation",  color: "#ef4444" },
              { label: "Slack",    detail: "Notification with 15-min cooldown",    color: "#34d399" },
            ].map((step, i) => (
              <div key={step.label} className="flex items-start">
                <FlowStep {...step} />
                {i < 3 && (
                  <span className="font-jetbrains text-[#21262d] text-lg mt-2 mx-1 select-none">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        <p className="font-rajdhani text-[10px] tracking-[0.3em] text-[#8b949e] uppercase mb-10">
          What&apos;s inside
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard
            tag="Transport"
            title="SSE Streaming"
            body="One persistent HTTP connection per panel. The browser's native EventSource API auto-reconnects — no polling, no WebSocket upgrade."
          />
          <FeatureCard
            tag="Storage"
            title="Redis Time-Series"
            body="Sorted sets keyed by Unix timestamp. ZRANGEBYSCORE reads a time window in O(log N + K). Old data trimmed automatically — no cleanup jobs."
          />
          <FeatureCard
            tag="Intelligence"
            title="Anomaly Detection"
            body="Rolling mean and standard deviation computed per chart. Readings beyond 2σ above the mean are flagged live with a red dot."
          />
          <FeatureCard
            tag="Reliability"
            title="Duration-based Alerts"
            body="An alert only fires if the metric exceeds the threshold continuously for the full configured window — eliminating noise from normal short spikes."
          />
          <FeatureCard
            tag="Integration"
            title="GitHub Webhooks"
            body="workflow_run events verified with HMAC-SHA256 using timingSafeEqual. Status and commit metadata stored in Postgres per delivery."
          />
          <FeatureCard
            tag="Observability"
            title="Live Log Stream"
            body="Separate SSE stream for logs. In-browser severity filter and text search work against the in-memory buffer — no round-trip per keystroke."
          />
        </div>
      </section>

      <section className="relative z-10 border-t border-[#21262d] bg-[#0d1117]/60">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="font-rajdhani text-[10px] tracking-[0.3em] text-[#8b949e] uppercase mb-6">
            Built with
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              "Next.js 16",
              "TypeScript",
              "PostgreSQL · Neon",
              "Redis · Upstash",
              "Drizzle ORM",
              "Recharts",
              "Tailwind CSS",
              "Vercel",
            ].map((tech) => (
              <span
                key={tech}
                className="font-jetbrains text-[11px] px-3 py-1.5 rounded-lg border border-[#21262d] text-[#8b949e] hover:border-[#30363d] hover:text-[#e6edf3] transition-colors cursor-default"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
