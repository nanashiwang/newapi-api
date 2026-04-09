"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { CrsPlatformAccount } from "@/lib/dashboard-types";
import { formatCompactNumber, formatNumber } from "@/lib/formatters";

interface CrsPlatformTableProps {
  platforms: Record<string, CrsPlatformAccount>;
}

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude",
  "claude-console": "Claude Console",
  gemini: "Gemini",
  bedrock: "Bedrock",
  openai: "OpenAI",
  ccr: "CCR",
  "openai-responses": "OpenAI Responses",
  droid: "Droid",
};

function getPlatformDisplayName(key: string): string {
  return PLATFORM_DISPLAY_NAMES[key] ?? key;
}

function getAccountHealthClass(platform: CrsPlatformAccount): string {
  if (platform.abnormal > 0 || platform.rateLimited > 0) {
    return "text-[#ff9d9d]";
  }

  if (platform.paused > 0) {
    return "text-[#ffcd6a]";
  }

  return "text-[#5be38f]";
}

export function CrsPlatformTable({ platforms }: CrsPlatformTableProps) {
  const [query, setQuery] = useState("");

  const entries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return Object.entries(platforms)
      .filter(([, account]) => account.total > 0)
      .filter(
        ([key]) =>
          !normalizedQuery ||
          key.toLowerCase().includes(normalizedQuery) ||
          getPlatformDisplayName(key).toLowerCase().includes(normalizedQuery),
      )
      .sort(([, a], [, b]) => b.total - a.total);
  }, [platforms, query]);

  const totals = useMemo(() => {
    return entries.reduce(
      (acc, [, account]) => ({
        total: acc.total + account.total,
        normal: acc.normal + account.normal,
        abnormal: acc.abnormal + account.abnormal,
        paused: acc.paused + account.paused,
        rateLimited: acc.rateLimited + account.rateLimited,
      }),
      { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 },
    );
  }, [entries]);

  return (
    <section className="surface-card p-6">
      <div className="flex flex-col gap-4 border-b border-white/8 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="stat-note">Platform Accounts</p>
          <h2 className="section-title mt-2">平台账号分布</h2>
          <p className="muted-copy mt-2">
            各平台的账号数量与健康状态，自动隐藏无账号的平台。
          </p>
        </div>

        <div className="w-full max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="筛选平台名称"
              className="field-input pl-11"
            />
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state mt-6 min-h-[180px]">
          没有符合筛选条件的平台，或当前站点没有已注册的账号。
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[18px] border border-white/8 bg-[var(--panel-2)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/8 bg-[rgba(255,255,255,0.02)] text-left text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  <th className="px-4 py-4">平台</th>
                  <th className="px-4 py-4 text-center">总账号</th>
                  <th className="px-4 py-4 text-center">正常</th>
                  <th className="px-4 py-4 text-center">异常</th>
                  <th className="px-4 py-4 text-center">暂停</th>
                  <th className="px-4 py-4 text-center">限速</th>
                  <th className="px-4 py-4 text-center">健康度</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(([key, account]) => {
                  const healthRate =
                    account.total > 0
                      ? ((account.normal / account.total) * 100).toFixed(0)
                      : "0";

                  return (
                    <tr
                      key={key}
                      className={`border-b border-white/8 transition hover:bg-[rgba(255,255,255,0.03)] ${
                        account.abnormal > 0
                          ? "bg-[rgba(255,91,91,0.06)]"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-4 font-semibold text-[var(--text)]">
                        {getPlatformDisplayName(key)}
                      </td>
                      <td className="px-4 py-4 text-center text-[var(--text)]">
                        {formatNumber(account.total)}
                      </td>
                      <td className="px-4 py-4 text-center text-[#5be38f]">
                        {formatNumber(account.normal)}
                      </td>
                      <td className="px-4 py-4 text-center text-[#ff9d9d]">
                        {formatNumber(account.abnormal)}
                      </td>
                      <td className="px-4 py-4 text-center text-[#ffcd6a]">
                        {formatNumber(account.paused)}
                      </td>
                      <td className="px-4 py-4 text-center text-[#ffcd6a]">
                        {formatNumber(account.rateLimited)}
                      </td>
                      <td className={`px-4 py-4 text-center font-semibold ${getAccountHealthClass(account)}`}>
                        {healthRate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[rgba(110,168,254,0.12)] text-[#dbe8ff]">
                  <td className="px-4 py-4 text-sm font-semibold">汇总</td>
                  <td className="px-4 py-4 text-center text-sm font-semibold">
                    {formatNumber(totals.total)}
                  </td>
                  <td className="px-4 py-4 text-center text-sm font-semibold text-[#5be38f]">
                    {formatNumber(totals.normal)}
                  </td>
                  <td className="px-4 py-4 text-center text-sm font-semibold text-[#ff9d9d]">
                    {formatNumber(totals.abnormal)}
                  </td>
                  <td className="px-4 py-4 text-center text-sm font-semibold text-[#ffcd6a]">
                    {formatNumber(totals.paused)}
                  </td>
                  <td className="px-4 py-4 text-center text-sm font-semibold text-[#ffcd6a]">
                    {formatNumber(totals.rateLimited)}
                  </td>
                  <td className="px-4 py-4 text-center text-sm font-semibold">
                    {totals.total > 0
                      ? `${((totals.normal / totals.total) * 100).toFixed(0)}%`
                      : "--"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
