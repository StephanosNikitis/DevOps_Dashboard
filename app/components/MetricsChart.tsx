"use client";

/**
 * A single metric card with:
 *  - Current value (large, colored, monospace)
 *  - Delta badge showing change from previous reading
 *  - SPIKE badge when anomaly detected (> mean + 2 standard deviations)
 *  - Recharts line chart of the last 60 readings (2 minutes)
 *  - Optional dashed threshold line
 *  - Red dots on anomalous data points
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MetricPoint } from "@/lib/metrics";

interface MetricsChartProps {
  title: string;
  color: string;      // e.g. "#38bdf8"
  glowColor: string;  // e.g. "rgba(56,189,248,0.35)"
  data: MetricPoint[];
  threshold?: number; // draws a dashed red line at this percentage
}

// Anomaly Detection 
// A "spike" is any reading more than 2 standard deviations above the mean.
// This is a simple but effective heuristic for detecting unusual metric spikes.
function computeStats(data: MetricPoint[]) {
  if (data.length < 5) return { mean: 0, stddev: 0 };
  const values = data.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, stddev: Math.sqrt(variance) };
}

// Custom Tooltip 
function CustomTooltip({ active, payload, label, color }: any) {
  if (!active || !payload?.length) return null;
  const isAnomaly = payload[0]?.payload?.isAnomaly;
  return (
    <div className="bg-surface border border-border px-3 py-2 rounded text-xs font-jetbrains shadow-lg">
      <p className="text-muted mb-1">{label}</p>
      <p style={{ color }}>{payload[0].value.toFixed(1)}%</p>
      {isAnomaly && <p className="text-red-400 mt-0.5">⚠ ANOMALY</p>}
    </div>
  );
}

// Custom Dot 
// Only renders a visible dot when the point is an anomaly — keeps the chart
// clean while still flagging spikes clearly.
function CustomDot(props: any) {
  const { cx, cy, payload } = props;
  if (!payload?.isAnomaly) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="#f87171"
      stroke="#ef4444"
      strokeWidth={1}
      style={{ filter: "drop-shadow(0 0 6px rgba(239,68,68,0.8))" }}
    />
  );
}

export default function MetricsChart({
  title,
  color,
  glowColor,
  data,
  threshold,
}: MetricsChartProps) {
  const { mean, stddev } = computeStats(data);
  const anomalyThreshold = mean + 2 * stddev;

  // Transform MetricPoint[] into the shape Recharts expects
  // Slice to the last 60 points (2 min of data at 2s intervals)
  const chartData = data.slice(-60).map((p) => ({
    time: new Date(p.ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    value: p.value,
    // Mark this point as an anomaly for the custom dot renderer
    isAnomaly: stddev > 1 && p.value > anomalyThreshold,
  }));

  // Current and previous values for the delta badge
  const current = data.length > 0 ? data[data.length - 1].value : 0;
  const prev = data.length > 1 ? data[data.length - 2].value : current;
  const delta = current - prev;

  // Is the CURRENT reading an anomaly? (drives the SPIKE badge)
  const isCurrentAnomaly = stddev > 1 && current > anomalyThreshold;

  return (
    <div className="relative bg-surface border border-border rounded-xl p-5 overflow-hidden">
      <div
        className="absolute -top-6 -right-6 w-32 h-32 rounded-full blur-3xl pointer-events-none opacity-20"
        style={{ backgroundColor: color }}
      />

      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="font-rajdhani text-[10px] tracking-[0.25em] text-muted uppercase mb-2">
            {title}
          </p>

          <div className="flex items-baseline gap-1.5">
            <span
              className="font-jetbrains text-[2.5rem] font-bold leading-none tabular-nums"
              style={{
                color,
                textShadow: `0 0 24px ${glowColor}`,
              }}
            >
              {current.toFixed(1)}
            </span>
            <span className="font-jetbrains text-muted text-sm">%</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 mt-1">
          <span
            className={`font-jetbrains text-[11px] px-2 py-0.5 rounded-full ${
              Math.abs(delta) < 0.3
                ? "text-muted bg-border"
                : delta > 0
                ? "text-red-400 bg-red-950/60"
                : "text-sky-400 bg-sky-950/60"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>

          {isCurrentAnomaly && (
            <span className="font-rajdhani text-[10px] tracking-widest text-red-400 bg-red-950/60 border border-red-800/40 px-2 py-0.5 rounded-full animate-pulse">
              ⚠ SPIKE
            </span>
          )}
        </div>
      </div>

      <div className="h-32 w-full min-w-0">
        <ResponsiveContainer width="99%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#21262d"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: "#484f58", fontSize: 9, fontFamily: "var(--font-jetbrains)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#484f58", fontSize: 9, fontFamily: "var(--font-jetbrains)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip color={color} />} />

            {threshold && (
              <ReferenceLine
                y={threshold}
                stroke="#ef4444"
                strokeDasharray="4 3"
                strokeOpacity={0.4}
              />
            )}

            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              // Disable Recharts' built-in animation — it causes jank on
              // real-time updates because every new point triggers a re-animation
              isAnimationActive={false}
              dot={<CustomDot />}
              activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="font-jetbrains text-[9px] text-[#484f58] mt-2 text-right">
        {data.length} pts · last {Math.round((data.length * 2) / 60)} min
      </p>
    </div>
  );
}