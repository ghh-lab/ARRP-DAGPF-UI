"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fillForVegCatCode } from "@/lib/veg-chart-colors";

export type VegCatPieSlice = {
  name: string;
  value: number;
  tooltipHa: number;
  /** Code veg_cat ou null pour tranches hors catalogue (ex. Non etiquete). */
  vegCode: number | null;
};

function VegCatPieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name?: unknown;
    value?: unknown;
    payload?: VegCatPieSlice;
  }>;
}) {
  if (!active || !payload?.[0]) return null;
  const p0 = payload[0];
  const row = p0.payload;
  const cat =
    typeof p0.name === "string" ? p0.name : String(p0.name ?? "");
  const haSource = row?.tooltipHa;
  const v =
    typeof haSource === "number"
      ? haSource
      : typeof p0.value === "number"
        ? p0.value
        : Number.parseFloat(String(p0.value ?? ""));
  const surf = Number.isFinite(v)
    ? v.toLocaleString("fr-FR", {
        maximumFractionDigits: 2,
      }) + " ha"
    : "";
  return (
    <div className="rounded border border-emerald-900/15 bg-white px-2 py-1.5 text-xs text-emerald-950 shadow-md">
      {cat} - {surf}
    </div>
  );
}

export function VegCatPieChart({ data }: { data: VegCatPieSlice[] }) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ name, percent }) => {
            const p = (percent ?? 0) * 100;
            const short =
              typeof name === "string" ? name.split(" (")[0] : "";
            return p >= 3 ? `${short} (${p.toFixed(0)}%)` : "";
          }}
        >
          {data.map((slice, i) => (
            <Cell
              key={i}
              fill={fillForVegCatCode(slice.vegCode)}
              stroke="#f8fafc"
            />
          ))}
        </Pie>
        <Tooltip content={<VegCatPieTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
