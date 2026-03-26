"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Server, TriangleAlert } from "lucide-react";
import type { SiteSummaryRow } from "@/lib/dashboard-types";

interface SiteSidebarProps {
  sites: SiteSummaryRow[];
  activeSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  onAddSite: () => void;
}

export function SiteSidebar({ sites, activeSiteId, onSelectSite, onAddSite }: SiteSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["all"]));

  const groupedSites = sites.reduce((acc, site) => {
    const group = site.group.trim() || "未分组";
    if (!acc[group]) acc[group] = [];
    acc[group].push(site);
    return acc;
  }, {} as Record<string, SiteSummaryRow[]>);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const isLowBalance = (site: SiteSummaryRow) =>
    site.warningQuota !== null &&
    site.warningQuota > 0 &&
    site.currentBalance !== null &&
    site.currentBalance <= site.warningQuota;

  return (
    <aside className="w-80 border-r border-white/20 bg-white/80 backdrop-blur-xl">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-4">
          <button
            type="button"
            onClick={onAddSite}
            className="primary-button w-full justify-center"
          >
            <Plus className="size-4" />
            添加站点
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {Object.entries(groupedSites).map(([group, groupSites]) => {
              const isExpanded = expandedGroups.has(group);
              const warningCount = groupSites.filter(isLowBalance).length;

              return (
                <div key={group}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                      <span>{group}</span>
                      <span className="text-xs text-slate-500">({groupSites.length})</span>
                    </div>
                    {warningCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <TriangleAlert className="size-3" />
                        {warningCount}
                      </span>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-1">
                      {groupSites.map((site) => {
                        const isActive = site.id === activeSiteId;
                        const hasWarning = isLowBalance(site);

                        return (
                          <button
                            key={site.id}
                            type="button"
                            onClick={() => onSelectSite(site.id)}
                            className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                              isActive
                                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
                                : hasWarning
                                  ? "bg-red-50 text-red-700 hover:bg-red-100"
                                  : "text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <Server className="mt-0.5 size-4 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{site.name}</p>
                              <p className="mt-0.5 truncate text-xs opacity-80">{site.host}</p>
                            </div>
                            {hasWarning && !isActive && (
                              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
