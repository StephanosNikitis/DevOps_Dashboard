"use client";

/**
 * A terminal-style live log viewer with:
 *  - SSE connection to /api/logs (new entries arrive every 0.8–3 seconds)
 *  - History pre-load from /api/logs/history on mount
 *  - Severity filter: ALL / INFO / WARN / ERROR
 *  - Text search across message and source fields
 *  - Auto-scroll to newest entry (pauses when user scrolls up manually)
 *  - "Jump to latest" button when auto-scroll is paused
 *  - Entry count badges per severity level
 *  - Color-coded source labels
 */

import { useState, useEffect, useRef } from "react";
import type { LogEntry, LogLevel } from "@/lib/logs";

const MAX_LOGS = 200; // Cap in-memory log buffer to keep renders fast

// Badge style per severity level (active filter state)
const LEVEL_ACTIVE: Record<LogLevel, string> = {
  INFO:  "text-sky-400  bg-sky-950/50  border-sky-800/40",
  WARN:  "text-amber-400 bg-amber-950/50 border-amber-800/40",
  ERROR: "text-red-400  bg-red-950/50  border-red-800/40",
};

// Text color for the message itself
const MESSAGE_COLOR: Record<LogLevel, string> = {
  INFO:  "text-[#c9d1d9]",
  WARN:  "text-amber-200/80",
  ERROR: "text-red-300",
};

// Color per source service — makes it easy to spot which service is noisy
const SOURCE_COLOR: Record<string, string> = {
  "api-server": "#a78bfa", // violet
  worker:       "#34d399", // emerald
  nginx:        "#60a5fa", // blue
  postgres:     "#f472b6", // pink
  redis:        "#fb923c", // orange
  docker:       "#38bdf8", // sky
  scheduler:    "#a3e635", // lime
};

function LevelBadge({ level }: { level: LogLevel }) {
  const colors: Record<LogLevel, string> = {
    INFO:  "text-sky-400  border-sky-800/30  bg-sky-950/30",
    WARN:  "text-amber-400 border-amber-800/30 bg-amber-950/30",
    ERROR: "text-red-400  border-red-800/30  bg-red-950/30",
  };
  return (
    <span
      className={`shrink-0 font-jetbrains text-[9px] font-semibold tracking-wider uppercase px-1.5 py-px rounded border ${colors[level]}`}
    >
      {level}
    </span>
  );
}

function LogLine({ log }: { log: LogEntry }) {
  const time = new Date(log.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const sourceColor = SOURCE_COLOR[log.source] ?? "#8b949e";

  return (
    <div className="flex items-start gap-2.5 px-4 py-[5px] hover:bg-white/[0.02] transition-colors group">

      <span className="font-jetbrains text-[11px] text-[#484f58] shrink-0 tabular-nums leading-5">
        {time}
      </span>

      <LevelBadge level={log.level} />

      <span
        className="font-jetbrains text-[11px] shrink-0 leading-5"
        style={{ color: sourceColor }}
      >
        {log.source}
      </span>

      <span className={`font-jetbrains text-[11px] leading-5 ${MESSAGE_COLOR[log.level]}`}>
        {log.message}
      </span>
    </div>
  );
}

export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history + open SSE 
  useEffect(() => {
    // Pre-populate with recent logs so the viewer isn't empty
    fetch("/api/logs/history")
      .then((r) => r.json())
      .then((recent: LogEntry[]) => {
        // History arrives newest-first — reverse for chronological display
        setLogs(recent.slice(0, MAX_LOGS).reverse());
      })
      .catch(() => {
        // History unavailable — viewer starts empty, SSE will fill it
      });

    const es = new EventSource("/api/logs");

    es.onopen = () => setConnected(true);

    es.onmessage = (event: MessageEvent) => {
      const entry: LogEntry = JSON.parse(event.data);
      setLogs((prev) => {
        // Append new entry, cap buffer at MAX_LOGS
        const next = [...prev, entry];
        return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
      });
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  // Auto-scroll to newest entry
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Detect manual scroll to pause auto-scroll
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "at bottom" if within 60px of the scroll bottom
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  };

  // Filtered log list 
  const filteredLogs = logs.filter((log) => {
    if (filter !== "ALL" && log.level !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.source.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Count per level for filter button badges
  const counts = logs.reduce(
    (acc, log) => ({ ...acc, [log.level]: (acc[log.level] ?? 0) + 1 }),
    {} as Partial<Record<LogLevel, number>>
  );

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">

      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <p className="font-rajdhani text-[10px] tracking-[0.25em] text-muted uppercase">
            Live Logs
          </p>

          <div
            className={`flex items-center gap-1.5 font-jetbrains text-[10px] ${
              connected ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            {connected ? "streaming" : "reconnecting"}
          </div>
        </div>

        <span className="font-jetbrains text-[10px] text-muted tabular-nums">
          {filteredLogs.length}
          {filter !== "ALL" || search ? ` / ${logs.length}` : ""} entries
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border bg-base/40">

        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter("ALL")}
            className={`font-jetbrains text-[10px] px-2.5 py-1 rounded border transition-colors ${
              filter === "ALL"
                ? "bg-[#21262d] border-[#30363d] text-[#e6edf3]"
                : "bg-transparent border-border text-muted hover:border-[#30363d] hover:text-[#e6edf3]"
            }`}
          >
            ALL
          </button>

          {(["INFO", "WARN", "ERROR"] as LogLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`font-jetbrains text-[10px] px-2.5 py-1 rounded border transition-colors ${
                filter === level
                  ? LEVEL_ACTIVE[level]
                  : "bg-transparent border-border text-muted hover:border-[#30363d] hover:text-[#e6edf3]"
              }`}
            >
              {level}
              {counts[level] != null && (
                <span className="ml-1.5 opacity-60">{counts[level]}</span>
              )}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search message or source…"
          className="flex-1 min-w-36 font-jetbrains text-[11px] bg-base border border-border rounded px-3 py-1 text-[#e6edf3] placeholder:text-[#484f58] focus:outline-none focus:border-[#30363d] transition-colors"
        />

        {search && (
          <button
            onClick={() => setSearch("")}
            className="font-jetbrains text-[10px] text-muted hover:text-[#e6edf3] transition-colors px-1"
          >
            ✕
          </button>
        )}
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-80 overflow-y-auto"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#21262d transparent" }}
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full font-jetbrains text-[11px] text-muted">
              {connected
                ? search || filter !== "ALL"
                  ? "No entries match your filter"
                  : "Waiting for logs…"
                : "Connecting to log stream…"}
            </div>
          ) : (
            <>
              {filteredLogs.map((log) => (
                <LogLine key={log.id} log={log} />
              ))}
            </>
          )}
        </div>

        {!autoScroll && (
          <div className="absolute bottom-3 right-3 z-10">
            <button
              onClick={() => {
                setAutoScroll(true);
                if(scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
              }}
              className="font-jetbrains text-[10px] bg-[#21262d] border border-border text-muted hover:text-[#e6edf3] hover:border-[#30363d] px-3 py-1.5 rounded-full transition-colors shadow-lg"
            >
              ↓ Jump to latest
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
