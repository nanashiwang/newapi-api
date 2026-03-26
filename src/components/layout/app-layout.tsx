"use client";

import { AppHeader } from "./app-header";
import { SiteSidebar } from "./site-sidebar";
import type { SiteSummaryRow } from "@/lib/dashboard-types";

interface AppLayoutProps {
  children: React.ReactNode;
  sites: SiteSummaryRow[];
  activeSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  onAddSite: () => void;
  onRefreshAll: () => void;
  isRefreshing: boolean;
}

export function AppLayout({
  children,
  sites,
  activeSiteId,
  onSelectSite,
  onAddSite,
  onRefreshAll,
  isRefreshing,
}: AppLayoutProps) {
  return (
    <div className="flex h-screen flex-col">
      <AppHeader onRefreshAll={onRefreshAll} isRefreshing={isRefreshing} />
      <div className="flex flex-1 overflow-hidden">
        <SiteSidebar
          sites={sites}
          activeSiteId={activeSiteId}
          onSelectSite={onSelectSite}
          onAddSite={onAddSite}
        />
        <main className="flex-1 overflow-y-auto bg-white p-6">{children}</main>
      </div>
    </div>
  );
}
