"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ModelBreakdownItem } from "@/lib/dashboard-types";
import {
  formatCompactNumber,
  formatNumber,
  formatTimestampLabel,
  truncateLabel,
} from "@/lib/formatters";

interface ModelBreakdownProps {
  models: ModelBreakdownItem[];
  query: string;
  onQueryChange: (value: string) => void;
}

type ModelTooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload?: {
      name: string;
      quota: number;
      requests: number;
    };
  }>;
};

function CustomModelTooltip({ active, payload }: ModelTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const record = payload[0]?.payload as {
    name: string;
    quota: number;
    requests: number;
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(11,16,32,0.94)] px-4 py-3 shadow-2xl shadow-black/35 backdrop-blur">
      <p className="text-sm font-semibold text-[var(--text)]">{record.name}</p>
      <div className="mt-2 space-y-1 text-sm text-[var(--muted)]">
        <p>额度消耗：{formatNumber(record.quota)}</p>
        <p>请求次数：{formatNumber(record.requests)}</p>
      </div>
    </div>
  );
}

export function ModelBreakdown({
  models,
  query,
  onQueryChange,
}: ModelBreakdownProps) {
  const chartData = models.slice(0, 6).map((model) => ({
    name: truncateLabel(model.name, 20),
    quota: model.quota,
    requests: model.requests,
  }));

  return (
    <section className="surface-card p-6">
      <div className="flex flex-col gap-4 border-b border-white/8 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="stat-note">Model Mix</p>
          <h2 className="section-title mt-2">模型消耗分布</h2>
          <p className="muted-copy mt-2">
            快速识别哪几个模型正在吞额度，以及它们各自的请求密度。
          </p>
        </div>

        <div className="w-full max-w-xs">
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="筛选模型名称"
            className="field-input"
          />
        </div>
      </div>

      {models.length === 0 ? (
        <div className="empty-state mt-6 min-h-[280px]">选定时间内没有模型消耗记录。</div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="soft-panel">
            <div className="mb-4">
              <p className="text-sm font-semibold text-[var(--text)]">Top 6 模型</p>
              <p className="mt-1 text-sm text-[var(--muted)]">按额度消耗降序展示。</p>
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 8, left: 12, bottom: 8 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" horizontal={false} />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#9fb0d1", fontSize: 12 }}
                    tickFormatter={(value) => formatCompactNumber(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#dce6ff", fontSize: 12 }}
                  />
                  <Tooltip content={<CustomModelTooltip />} />
                  <Bar dataKey="quota" radius={[0, 12, 12, 0]} fill="#6ea8fe" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-3">
            {models.map((model) => (
              <article
                key={`${model.name}-${model.lastSeen}`}
                className="rounded-2xl border border-white/8 bg-[var(--panel-2)] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text)]">{model.name}</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      最近活跃：{formatTimestampLabel(model.lastSeen)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-semibold tracking-[-0.04em] text-[#dce6ff]">
                      {formatNumber(model.quota)}
                    </p>
                    <p className="text-sm text-[var(--muted)]">额度消耗</p>
                  </div>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--panel-3)]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#6ea8fe,#28c76f)]"
                    style={{ width: `${Math.min(model.share, 100)}%` }}
                  />
                </div>

                <div className="mt-4 grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-3">
                  <p>占比：{model.share.toFixed(model.share >= 10 ? 1 : 2)}%</p>
                  <p>请求：{formatNumber(model.requests)}</p>
                  <p>tokens：{formatCompactNumber(model.tokenUsed)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

