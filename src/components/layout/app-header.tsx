"use client";

import { RefreshCcw, Settings } from "lucide-react";

interface AppHeaderProps {
  onRefreshAll: () => void;
  isRefreshing: boolean;
}

export function AppHeader({ onRefreshAll, isRefreshing }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/20 bg-white/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/50">
            <span className="text-lg font-bold text-white">N</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">NewAPI 管理平台</h1>
            <p className="text-xs text-slate-600">多站点额度统计与充值</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="secondary-button"
          >
            <RefreshCcw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            刷新全部
          </button>
          <button type="button" className="secondary-button">
            <Settings className="size-4" />
            设置
          </button>
        </div>
      </div>
    </header>
  );
}
