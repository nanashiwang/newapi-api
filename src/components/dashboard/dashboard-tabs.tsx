"use client";

import { BarChart3, CreditCard, LayoutDashboard } from "lucide-react";

type TabType = "overview" | "consumption" | "recharge";

interface DashboardTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function DashboardTabs({ activeTab, onTabChange }: DashboardTabsProps) {
  const tabs = [
    { id: "overview" as TabType, label: "仪表盘概览", icon: LayoutDashboard },
    { id: "consumption" as TabType, label: "Token 消耗", icon: BarChart3 },
    { id: "recharge" as TabType, label: "充值管理", icon: CreditCard },
  ];

  return (
    <div className="border-b border-slate-200">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
