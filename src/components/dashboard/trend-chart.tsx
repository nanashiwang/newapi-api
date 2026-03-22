"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendPoint } from "@/lib/dashboard-types";
import { formatCompactNumber, formatNumber } from "@/lib/formatters";

interface TrendChartProps {
  data: TrendPoint[];
  granularity: "hourly" | "daily";
  onGranularityChange: (value: "hourly" | "daily") => void;
}

type TrendTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: Array<{
    dataKey?: string;
    value?: number;
  }>;
};

function CustomTrendTooltip({
  active,
  payload,
  label,
}: TrendTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const quota = payload.find((item) => item.dataKey === "quota")?.value ?? 0;
  const requests =
    payload.find((item) => item.dataKey === "requests")?.value ?? 0;
  const tokenUsed =
    payload.find((item) => item.dataKey === "tokenUsed")?.value ?? 0;

  return (
    <div className="rounded-3xl border border-white/70 bg-white/92 px-4 py-3 shadow-2xl shadow-slate-200/30 backdrop-blur">
      <p className="text-sm font-semibold text-[#1d2529]">{label}</p>
      <div className="mt-2 space-y-1 text-sm text-[#5c6d71]">
        <p>额度消耗：{formatNumber(Number(quota))}</p>
        <p>请求次数：{formatNumber(Number(requests))}</p>
        <p>tokens：{formatCompactNumber(Number(tokenUsed))}</p>
      </div>
    </div>
  );
}

export function TrendChart({
  data,
  granularity,
  onGranularityChange,
}: TrendChartProps) {
  return (
    <section className="surface-card p-6">
      <div className="flex flex-col gap-4 border-b border-black/5 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="stat-note">Quota Timeline</p>
          <h2 className="section-title mt-2">额度趋势</h2>
          <p className="muted-copy mt-2">
            基于 `/api/data/self` 返回的聚合数据展示额度消耗与请求强度。
          </p>
        </div>

        <div className="inline-flex rounded-full border border-black/5 bg-[#f7f4ec] p-1">
          <button
            type="button"
            onClick={() => onGranularityChange("hourly")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              granularity === "hourly"
                ? "bg-[#1d2529] text-white"
                : "text-[#5c6d71]"
            }`}
          >
            按小时
          </button>
          <button
            type="button"
            onClick={() => onGranularityChange("daily")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              granularity === "daily"
                ? "bg-[#1d2529] text-white"
                : "text-[#5c6d71]"
            }`}
          >
            按天
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-[1.5rem] bg-[#fbfaf5] text-center text-sm text-[#5c6d71]">
          当前时间区间没有额度明细，先确认 NewAPI 已开启数据导出，或尝试扩大查询范围。
        </div>
      ) : (
        <div className="mt-6 h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 10, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="quotaFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#0f766e" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#edf1f2" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#69797e", fontSize: 12 }}
              />
              <YAxis
                yAxisId="quota"
                axisLine={false}
                tickLine={false}
                width={70}
                tick={{ fill: "#69797e", fontSize: 12 }}
                tickFormatter={(value) => formatCompactNumber(Number(value))}
              />
              <YAxis yAxisId="requests" orientation="right" hide />
              <Tooltip content={<CustomTrendTooltip />} />
              <Area
                yAxisId="quota"
                type="monotone"
                dataKey="quota"
                stroke="#0f766e"
                strokeWidth={2.5}
                fill="url(#quotaFill)"
              />
              <Line
                yAxisId="requests"
                type="monotone"
                dataKey="requests"
                stroke="#d96749"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#d96749" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
