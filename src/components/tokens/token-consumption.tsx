"use client";

import { useMemo } from "react";
import { Activity, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardRange } from "@/lib/dashboard-types";
import { formatCompactNumber, formatTimestampLabel, formatUsd } from "@/lib/formatters";

interface TokenConsumptionProps {
  siteId: string;
  siteName: string;
  range: DashboardRange;
  consumptionData: Array<{ timestamp: number; usage: number; requests: number }>;
  modelBreakdown: Array<{ model: string; usage: number; requests: number }>;
}

export function TokenConsumption({
  siteName,
  range,
  consumptionData,
  modelBreakdown,
}: TokenConsumptionProps) {
  const totalUsage = useMemo(
    () => consumptionData.reduce((sum, d) => sum + d.usage, 0),
    [consumptionData],
  );

  const totalRequests = useMemo(
    () => consumptionData.reduce((sum, d) => sum + d.requests, 0),
    [consumptionData],
  );

  const chartData = useMemo(
    () =>
      consumptionData.map((d) => ({
        time: formatTimestampLabel(d.timestamp),
        usage: d.usage,
        requests: d.requests,
      })),
    [consumptionData],
  );

  return (
    <section className="surface-card p-6">
      <div className="border-b border-black/5 pb-5">
        <p className="stat-note">Token Consumption</p>
        <h2 className="section-title mt-2">{siteName} - Token 消耗详情</h2>
        <p className="muted-copy mt-2">
          时间范围：{range.startDate} 至 {range.endDate}
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-br from-[#dff7f2] to-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-[#0f766e] text-white">
              <Activity className="size-6" />
            </div>
            <div>
              <p className="text-sm text-[#5c6d71]">总消耗</p>
              <p className="text-2xl font-bold text-[#1d2529]">{formatUsd(totalUsage)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-[#fff0ca] to-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-[#c57700] text-white">
              <TrendingUp className="size-6" />
            </div>
            <div>
              <p className="text-sm text-[#5c6d71]">总请求数</p>
              <p className="text-2xl font-bold text-[#1d2529]">{formatCompactNumber(totalRequests)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-[#1d2529]">消耗趋势</h3>
        <div className="mt-4 h-64 rounded-2xl bg-[#fbfaf5] p-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#5c6d71" fontSize={12} />
              <YAxis stroke="#5c6d71" fontSize={12} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="usage"
                stroke="#0f766e"
                fillOpacity={1}
                fill="url(#usageGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-[#1d2529]">模型消耗分布</h3>
        <div className="mt-4 overflow-hidden rounded-2xl border border-black/5">
          <table className="w-full text-sm">
            <thead className="bg-[#f3eee4]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[#1d2529]">模型</th>
                <th className="px-4 py-3 text-right font-semibold text-[#1d2529]">消耗</th>
                <th className="px-4 py-3 text-right font-semibold text-[#1d2529]">请求数</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {modelBreakdown.map((model, idx) => (
                <tr key={idx} className="border-t border-black/5">
                  <td className="px-4 py-3 text-[#4f5d62]">{model.model}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#1d2529]">
                    {formatUsd(model.usage)}
                  </td>
                  <td className="px-4 py-3 text-right text-[#4f5d62]">
                    {formatCompactNumber(model.requests)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
