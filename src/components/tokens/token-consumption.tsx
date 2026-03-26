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
        <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5 border border-blue-100">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg">
              <Activity className="size-6" />
            </div>
            <div>
              <p className="text-sm text-slate-600">总消耗</p>
              <p className="text-2xl font-bold text-slate-900">{formatUsd(totalUsage)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-5 border border-amber-100">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg">
              <TrendingUp className="size-6" />
            </div>
            <div>
              <p className="text-sm text-slate-600">总请求数</p>
              <p className="text-2xl font-bold text-slate-900">{formatCompactNumber(totalRequests)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-900">消耗趋势</h3>
        <div className="mt-4 h-64 rounded-2xl bg-slate-50 border border-slate-200 p-4">
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
        <h3 className="text-sm font-semibold text-slate-900">模型消耗分布</h3>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-900">模型</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-900">消耗</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-900">请求数</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {modelBreakdown.map((model, idx) => (
                <tr key={idx} className="border-t border-slate-200">
                  <td className="px-4 py-3 text-slate-700">{model.model}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatUsd(model.usage)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
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
