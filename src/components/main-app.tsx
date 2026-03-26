"use client";

import { useState, useEffect, useMemo } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { SiteSidebar } from "@/components/layout/site-sidebar";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SiteBalanceTable } from "@/components/dashboard/site-balance-table";
import { TokenConsumption } from "@/components/tokens/token-consumption";
import { RechargePanel } from "@/components/recharge/recharge-panel";
import { Activity, Wallet, TrendingUp, Layers3 } from "lucide-react";
import type { SiteConfig, SiteSummaryRow, DashboardRange, DashboardData } from "@/lib/dashboard-types";
import { formatDateInput, shiftDate, formatUsd, formatCompactNumber } from "@/lib/formatters";

type TabType = "overview" | "consumption" | "recharge";

const SITES_KEY = "newapi-quota-dashboard:sites";
const ACTIVE_SITE_KEY = "newapi-quota-dashboard:active-site";

function createDefaultRange(): DashboardRange {
  const today = new Date();
  return {
    startDate: formatDateInput(shiftDate(today, -6)),
    endDate: formatDateInput(today),
  };
}

export function MainApp() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, SiteSummaryRow>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [range] = useState<DashboardRange>(createDefaultRange);

  useEffect(() => {
    const stored = localStorage.getItem(SITES_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSites(Array.isArray(parsed) ? parsed : []);
      } catch {}
    }

    const activeId = localStorage.getItem(ACTIVE_SITE_KEY);
    if (activeId) setActiveSiteId(activeId);
  }, []);

  const summaryRows = useMemo(() => {
    return sites.map(site => {
      const summary = summaries[site.id];
      return summary || {
        id: site.id,
        name: site.name,
        group: site.group,
        host: new URL(site.baseUrl.startsWith('http') ? site.baseUrl : `https://${site.baseUrl}`).host,
        baseUrl: site.baseUrl,
        authTypeLabel: site.authType,
        currentBalance: null,
        warningQuota: site.warningQuota,
        historicalUsage: null,
        periodQuota: null,
        totalRequests: null,
        activeModels: null,
        status: "idle" as const,
        lastSyncedAt: null,
        message: null,
      };
    });
  }, [sites, summaries]);

  const handleSelectSite = (siteId: string) => {
    setActiveSiteId(siteId);
    localStorage.setItem(ACTIVE_SITE_KEY, siteId);
  };

  const handleAddSite = () => {
    setActiveTab("overview");
  };

  const handleRefreshAll = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 2000);
  };

  const activeSite = summaryRows.find((s) => s.id === activeSiteId);

  const totalBalance = summaryRows.reduce((sum, s) => sum + (s.currentBalance || 0), 0);
  const totalUsage = summaryRows.reduce((sum, s) => sum + (s.periodQuota || 0), 0);
  const totalRequests = summaryRows.reduce((sum, s) => sum + (s.totalRequests || 0), 0);
  const activeModels = summaryRows.reduce((sum, s) => sum + (s.activeModels || 0), 0);

  return (
    <div className="flex h-screen flex-col">
      <AppHeader onRefreshAll={handleRefreshAll} isRefreshing={isRefreshing} />

      <div className="flex flex-1 overflow-hidden">
        <SiteSidebar
          sites={summaryRows}
          activeSiteId={activeSiteId}
          onSelectSite={handleSelectSite}
          onAddSite={handleAddSite}
        />

        <main className="flex-1 overflow-y-auto bg-white/50">
          <div className="p-6">
            <DashboardTabs activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="mt-6">
              {activeTab === "overview" && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                      icon={Wallet}
                      tone="teal"
                      label="总余额"
                      value={formatUsd(totalBalance)}
                      detail={`${summaryRows.length} 个站点`}
                    />
                    <MetricCard
                      icon={Activity}
                      tone="coral"
                      label="区间消耗"
                      value={formatUsd(totalUsage)}
                      detail={`${range.startDate} 至 ${range.endDate}`}
                    />
                    <MetricCard
                      icon={TrendingUp}
                      tone="amber"
                      label="总请求数"
                      value={formatCompactNumber(totalRequests)}
                      detail="所有站点累计"
                    />
                    <MetricCard
                      icon={Layers3}
                      tone="slate"
                      label="活跃模型"
                      value={activeModels.toString()}
                      detail="去重后模型数"
                    />
                  </div>

                  <SiteBalanceTable
                    rows={summaryRows}
                    activeSiteId={activeSiteId}
                    isRefreshingAll={isRefreshing}
                    refreshingSiteId={null}
                    range={range}
                    onSelect={handleSelectSite}
                    onRefreshSite={() => {}}
                    onRefreshAll={handleRefreshAll}
                  />
                </div>
              )}

              {activeTab === "consumption" && activeSite && (
                <TokenConsumption
                  siteId={activeSite.id}
                  siteName={activeSite.name}
                  range={range}
                  consumptionData={[]}
                  modelBreakdown={[]}
                />
              )}

              {activeTab === "recharge" && activeSite && (
                <RechargePanel
                  siteId={activeSite.id}
                  siteName={activeSite.name}
                  currentBalance={activeSite.currentBalance}
                  onRecharge={async () => {}}
                />
              )}

              {activeTab !== "overview" && !activeSite && (
                <div className="flex h-96 items-center justify-center rounded-2xl bg-slate-50 border border-slate-200 text-slate-600">
                  请先在左侧选择一个站点
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
