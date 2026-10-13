"use client";

import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastPoint } from "@/lib/air";
import { useI18n } from "@/lib/i18n";

function hourLabel(iso: string, lang: "bn" | "en") {
  return new Date(iso).toLocaleTimeString(lang === "bn" ? "bn-BD" : "en-GB", {
    hour: "numeric",
    hour12: lang !== "bn",
    timeZone: "Asia/Dhaka",
  });
}

export function ForecastChart({ points }: { points: ForecastPoint[] }) {
  const { lang, t, num } = useI18n();
  const data = points.map((p) => ({
    label: hourLabel(p.time, lang),
    pm25: p.pm25 == null ? null : Math.round(p.pm25),
    range: p.low != null && p.high != null ? [Math.round(p.low), Math.round(p.high)] : null,
  }));
  const hasRange = data.some((d) => d.range);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} interval={3} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => num(v)} />
          {/* WHO 24-hour guideline is 15 µg/m³ — a daily reference, not an hourly safe limit. */}
          <ReferenceLine y={15} stroke="var(--muted)" strokeDasharray="4 4" />
          {hasRange && <Area dataKey="range" stroke="none" fill="var(--accent)" fillOpacity={0.15} name={t.likelyRange} />}
          <Line dataKey="pm25" stroke="var(--accent)" strokeWidth={2.5} dot={false} name="PM2.5" connectNulls={false} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            formatter={(v: number | number[], name: string) =>
              Array.isArray(v) ? [`${num(v[0])}–${num(v[1])} µg/m³`, name] : [`${num(v)} µg/m³`, name]
            }
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
