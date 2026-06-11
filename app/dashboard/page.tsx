"use client";

import { useState, useEffect } from "react";
import MetricsChart from "@/app/components/MetricsChart";
import LogViewer from "@/app/components/LogViewer";
import PipelinePanel from "@/app/components/PipelinePanel";
import AlertPanel from "@/app/components/AlertPanel";
import type { MetricPoint, MetricsHistory, MetricSnapshot } from "@/lib/metrics";

const MAX_POINTS = 90;

function formatUptime(seconds: number): string {
  const hh = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const mm = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function appendPoint(prev: MetricPoint[], value: number, ts: number): MetricPoint[] {
  return [...prev, { value, ts }].slice(-MAX_POINTS);
}

export default function DashboardPage() {
  const [cpuData,   setCpuData]   = useState<MetricPoint[]>([]);
  const [ramData,   setRamData]   = useState<MetricPoint[]>([]);
  const [diskData,  setDiskData]  = useState<MetricPoint[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [uptime,    setUptime]    = useState(0);

  useEffect(() => {
    fetch("/api/metrics/history")
      .then((r) => r.json())
      .then((h: MetricsHistory) => {
        setCpuData(h.cpu.slice(-MAX_POINTS));
        setRamData(h.ram.slice(-MAX_POINTS));
        setDiskData(h.disk.slice(-MAX_POINTS));
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const es = new EventSource("/api/metrics");
    es.onopen    = () => setConnected(true);
    es.onerror   = () => setConnected(false);
    es.onmessage = (event: MessageEvent) => {
      const snap: MetricSnapshot = JSON.parse(event.data);
      setCpuData((prev)  => appendPoint(prev, snap.cpu,  snap.timestamp));
      setRamData((prev)  => appendPoint(prev, snap.ram,  snap.timestamp));
      setDiskData((prev) => appendPoint(prev, snap.disk, snap.timestamp));
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => setUptime((u) => u + 1), 1000);
    return () => clearInterval(id);
  }, [connected]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-base">
        <div className="flex items-center gap-3 text-muted font-jetbrains text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
          Connecting to metrics stream…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base text-[#e6edf3]">

      <header className="border-b border-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <polygon points="11,2 20,7 20,15 11,20 2,15 2,7" stroke="#38bdf8" strokeWidth="1.5" fill="none"/>
              <polygon points="11,6 16,9 16,13 11,16 6,13 6,9" fill="#38bdf8" fillOpacity="0.15"/>
            </svg>
            <h1 className="font-rajdhani text-lg font-semibold tracking-[0.2em] uppercase">
              DevOps Monitor
            </h1>
          </div>
          <div className="flex items-center gap-5">
            <div className={`flex items-center gap-2 font-jetbrains text-[11px] px-3 py-1 rounded-full border ${
              connected
                ? "text-emerald-400 border-emerald-800/50 bg-emerald-950/30"
                : "text-amber-400 border-amber-800/50 bg-amber-950/30"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {connected ? "LIVE" : "RECONNECTING"}
            </div>
            <span className="font-jetbrains text-sm text-muted tabular-nums hidden sm:block">
              {formatUptime(uptime)}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <section>
          <p className="font-rajdhani text-[10px] tracking-[0.3em] text-muted uppercase mb-4">
            Server Metrics — Real-time
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricsChart title="CPU Usage"  color="#38bdf8" glowColor="rgba(56,189,248,0.35)"  data={cpuData}  threshold={80}/>
            <MetricsChart title="RAM Usage"  color="#4ade80" glowColor="rgba(74,222,128,0.35)"  data={ramData}  threshold={85}/>
            <MetricsChart title="Disk Usage" color="#fb923c" glowColor="rgba(251,146,60,0.35)"  data={diskData} threshold={90}/>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6 text-[10px] font-jetbrains text-muted">
            <div className="flex items-center gap-2">
              <div className="w-6 border-t border-dashed border-red-500/40"/>
              <span>Alert threshold</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400" style={{ boxShadow: "0 0 5px rgba(239,68,68,0.8)" }}/>
              <span>Anomaly (2σ spike)</span>
            </div>
            <span>Readings every 2s · last 3 min shown</span>
          </div>
        </section>

        <section>
          <p className="font-rajdhani text-[10px] tracking-[0.3em] text-muted uppercase mb-4">
            Application Logs — Live Stream
          </p>
          <LogViewer />
        </section>

        <section>
          <p className="font-rajdhani text-[10px] tracking-[0.3em] text-muted uppercase mb-4">
            CI/CD Pipelines — Build History
          </p>
          <PipelinePanel />
        </section>

        <section className="pb-8">
          <p className="font-rajdhani text-[10px] tracking-[0.3em] text-muted uppercase mb-4">
            Alert Rules — Threshold Monitoring
          </p>
          <AlertPanel />
        </section>

      </main>
    </div>
  );
}