"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Activity,
  Copy,
  LayoutDashboard,
  LoaderCircle,
  PencilLine,
  RefreshCcw,
  Rows3,
  Search,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { ModelBreakdown } from "@/components/dashboard/model-breakdown";
import { SiteBalanceTable } from "@/components/dashboard/site-balance-table";
import { TrendChart } from "@/components/dashboard/trend-chart";
import type {
  AuthType,
  DashboardData,
  DashboardRange,
  DashboardRequest,
  ModelBreakdownItem,
  SiteConfig,
  SiteSummaryRow,
  TrendPoint,
} from "@/lib/dashboard-types";
import {
  formatCompactNumber,
  formatDateInput,
  formatNumber,
  formatPercent,
  formatRunway,
  formatTimestampLabel,
  shiftDate,
} from "@/lib/formatters";

export type DashboardSection = "dashboard" | "sites" | "board" | "insights";

type DashboardShellProps = {
  section?: DashboardSection;
};

type SiteDraft = {
  id: string | null;
  name: string;
  group: string;
  baseUrl: string;
  authType: AuthType;
  authValue: string;
  userId: string;
  warningQuota: string;
};

type DashboardApiResponse =
  | { success: true; data: DashboardData }
  | { success: false; message: string };

type Notice = {
  tone: "success" | "error";
  text: string;
};

const LEGACY_STORAGE_KEY = "newapi-quota-dashboard:connection";
const SITES_STORAGE_KEY = "newapi-quota-dashboard:sites";
const RANGE_STORAGE_KEY = "newapi-quota-dashboard:range";
const ACTIVE_SITE_STORAGE_KEY = "newapi-quota-dashboard:active-site";
const DEFAULT_GROUP_LABEL = "未分组";

const AUTH_MODE_OPTIONS: Array<{ value: AuthType; label: string }> = [
  { value: "authorization", label: "Authorization" },
  { value: "session", label: "session" },
  { value: "new-api-user", label: "New-Api-User" },
];

const RANGE_PRESETS = [
  { label: "24 小时", days: 1 },
  { label: "7 天", days: 7 },
  { label: "30 天", days: 30 },
] as const;

const SECTION_PATH_MAP: Record<DashboardSection, string> = {
  dashboard: "/dashboard",
  sites: "/sites",
  board: "/board",
  insights: "/insights",
};

const SECTION_NAV_ITEMS: Array<{
  section: DashboardSection;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
}> = [
  { section: "dashboard", label: "总览 Dashboard", shortLabel: "总览", icon: LayoutDashboard },
  { section: "sites", label: "站点管理", shortLabel: "站点", icon: ShieldCheck },
  { section: "board", label: "多站点余额表", shortLabel: "余额表", icon: Rows3 },
  { section: "insights", label: "活动站点详情", shortLabel: "详情", icon: Activity },
];

function getAuthTypeLabel(authType: AuthType): string {
  if (authType === "session") {
    return "session";
  }

  if (authType === "new-api-user") {
    return "New-Api-User";
  }

  return "Authorization";
}

function createRangeByDays(days: number): DashboardRange {
  const today = new Date();

  return {
    startDate: formatDateInput(shiftDate(today, -(days - 1))),
    endDate: formatDateInput(today),
  };
}

function createDefaultRange(): DashboardRange {
  return createRangeByDays(30);
}

function createEmptySiteDraft(): SiteDraft {
  return {
    id: null,
    name: "",
    group: "",
    baseUrl: "",
    authType: "authorization",
    authValue: "",
    userId: "",
    warningQuota: "",
  };
}

function siteToDraft(site: SiteConfig): SiteDraft {
  return {
    id: site.id,
    name: site.name,
    group: site.group,
    baseUrl: site.baseUrl,
    authType: site.authType,
    authValue: site.authValue,
    userId: site.userId ?? "",
    warningQuota: site.warningQuota === null ? "" : String(site.warningQuota),
  };
}

function parseHost(baseUrl: string): string {
  const raw = baseUrl.trim();
  if (!raw) {
    return "--";
  }

  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    return new URL(normalized).host;
  } catch {
    return raw;
  }
}

function deriveSiteName(name: string, baseUrl: string): string {
  return name.trim() || parseHost(baseUrl);
}

function generateSiteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `site-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function getAuthPlaceholder(authType: AuthType): string {
  if (authType === "session") {
    return "session 值，支持自动补成 session=...";
  }

  if (authType === "new-api-user") {
    return "填写 New-Api-User 对应的值";
  }

  return "例如 Bearer sk-xxx 或平台要求的 Authorization 值";
}

function normalizeOptionalText(rawValue: unknown): string | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeWarningQuotaValue(rawValue: unknown): number | null {
  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : null;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
}

function parseWarningQuotaInput(rawValue: string): { value: number | null; error: string | null } {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: "低余额阈值必须是大于等于 0 的数字。" };
  }

  return { value: parsed, error: null };
}

function normalizeSiteConfig(site: Partial<SiteConfig>): SiteConfig | null {
  if (!site.id || !site.baseUrl?.trim() || !site.authValue?.trim()) {
    return null;
  }

  const authType: AuthType =
    site.authType === "session" || site.authType === "new-api-user"
      ? site.authType
      : "authorization";

  return {
    id: site.id,
    name: deriveSiteName(site.name ?? "", site.baseUrl),
    group: typeof site.group === "string" ? site.group.trim() : "",
    baseUrl: site.baseUrl.trim(),
    authType,
    authValue: site.authValue.trim(),
    userId: normalizeOptionalText(site.userId),
    warningQuota: normalizeWarningQuotaValue(site.warningQuota),
  };
}

function buildSiteFromDraft(siteDraft: SiteDraft): { site: SiteConfig | null; error: string | null } {
  if (!siteDraft.baseUrl.trim()) {
    return { site: null, error: "请填写 NewAPI 地址。" };
  }

  if (!siteDraft.authValue.trim()) {
    return { site: null, error: "请填写鉴权值。" };
  }

  const warningQuotaState = parseWarningQuotaInput(siteDraft.warningQuota);
  if (warningQuotaState.error) {
    return { site: null, error: warningQuotaState.error };
  }

  return {
    site: {
      id: siteDraft.id ?? generateSiteId(),
      name: deriveSiteName(siteDraft.name, siteDraft.baseUrl),
      group: siteDraft.group.trim(),
      baseUrl: siteDraft.baseUrl.trim(),
      authType: siteDraft.authType,
      authValue: siteDraft.authValue.trim(),
      userId: normalizeOptionalText(siteDraft.userId),
      warningQuota: warningQuotaState.value,
    },
    error: null,
  };
}
function toStartTimestamp(dateValue: string): number {
  return Math.floor(new Date(`${dateValue}T00:00:00`).getTime() / 1000);
}

function toEndTimestamp(dateValue: string): number {
  return Math.floor(new Date(`${dateValue}T23:59:59.999`).getTime() / 1000);
}

function validateRange(range: DashboardRange): string | null {
  const startTimestamp = toStartTimestamp(range.startDate);
  const endTimestamp = toEndTimestamp(range.endDate);

  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
    return "日期格式无效，请重新选择。";
  }

  if (endTimestamp < startTimestamp) {
    return "结束日期不能早于开始日期。";
  }

  if (endTimestamp - startTimestamp > 30 * 24 * 60 * 60) {
    return "个人额度统计接口单次最多查询 30 天。";
  }

  return null;
}

function buildRequestBody(site: SiteConfig, range: DashboardRange): DashboardRequest {
  return {
    baseUrl: site.baseUrl,
    authType: site.authType,
    authValue: site.authValue,
    userId: site.userId,
    startTimestamp: toStartTimestamp(range.startDate),
    endTimestamp: toEndTimestamp(range.endDate),
  };
}

async function requestDashboardPayload(requestBody: DashboardRequest): Promise<DashboardData> {
  const response = await fetch("/api/dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const result = (await response.json()) as DashboardApiResponse;

  if (!response.ok || !result.success) {
    throw new Error("message" in result ? result.message : "加载额度数据失败。");
  }

  return result.data;
}

function createSummary(site: SiteConfig, overrides: Partial<SiteSummaryRow> = {}): SiteSummaryRow {
  return {
    status: "idle",
    currentBalance: null,
    historicalUsage: null,
    periodQuota: null,
    totalRequests: null,
    activeModels: null,
    lastSyncedAt: null,
    message: null,
    ...overrides,
    id: site.id,
    name: site.name,
    group: site.group,
    host: parseHost(site.baseUrl),
    baseUrl: site.baseUrl,
    authTypeLabel: getAuthTypeLabel(site.authType),
    warningQuota: site.warningQuota,
  };
}

function buildSuccessSummary(site: SiteConfig, data: DashboardData): SiteSummaryRow {
  return createSummary(site, {
    status: "ready",
    currentBalance: data.overview.currentBalance,
    historicalUsage: data.overview.historicalUsage,
    periodQuota: data.overview.periodQuota,
    totalRequests: data.overview.totalRequests,
    activeModels: data.overview.activeModels,
    lastSyncedAt: data.connection.lastSyncedAt,
    message: null,
  });
}

function getGroupLabel(group: string): string {
  return group.trim() || DEFAULT_GROUP_LABEL;
}

function isLowBalance(row: SiteSummaryRow): boolean {
  return (
    row.warningQuota !== null &&
    row.warningQuota > 0 &&
    row.currentBalance !== null &&
    row.currentBalance <= row.warningQuota
  );
}

function getStatusLabel(row: SiteSummaryRow): string {
  if (row.status === "error") {
    return "同步失败";
  }

  if (row.status === "loading") {
    return "同步中";
  }

  if (isLowBalance(row)) {
    return "低余额预警";
  }

  if (row.status === "ready") {
    return "正常";
  }

  return "待同步";
}

function sumNullable(rows: SiteSummaryRow[], selector: (row: SiteSummaryRow) => number | null): number | null {
  let total = 0;
  let hasValue = false;

  for (const row of rows) {
    const value = selector(row);
    if (value === null) {
      continue;
    }

    total += value;
    hasValue = true;
  }

  return hasValue ? total : null;
}

function getRangeSpanDays(range: DashboardRange): number {
  const span = toEndTimestamp(range.endDate) - toStartTimestamp(range.startDate) + 1;
  return Math.max(1, Math.round(span / 86400));
}

function getRangeLabel(range: DashboardRange): string {
  const preset = RANGE_PRESETS.find((item) => item.days === getRangeSpanDays(range));
  return preset ? preset.label : `${range.startDate} 至 ${range.endDate}`;
}

function buildLinePoints(data: TrendPoint[], width = 800, height = 260): string {
  if (data.length === 0) {
    return "";
  }

  const maxValue = Math.max(...data.map((point) => Math.max(point.quota, 0)), 1);
  const topPadding = 24;
  const bottomPadding = 24;
  const usableHeight = height - topPadding - bottomPadding;

  return data
    .map((point, index) => {
      const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
      const y = height - bottomPadding - (Math.max(point.quota, 0) / maxValue) * usableHeight;
      return `${x},${y}`;
    })
    .join(" ");
}

function TrendSvg({ data, accent = "blue" }: { data: TrendPoint[]; accent?: "blue" | "green" }) {
  if (data.length === 0) {
    return <div className="empty-panel small">当前区间还没有可视化趋势数据。</div>;
  }

  const linePoints = buildLinePoints(data);
  const fill = accent === "green" ? "rgba(40,199,111,0.18)" : "rgba(110,168,254,0.18)";
  const stroke = accent === "green" ? "#28c76f" : "#6ea8fe";

  return (
    <div className="chart">
      <svg viewBox="0 0 800 260" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill={fill} stroke="none" points={`${linePoints} 800,260 0,260`} />
        <polyline fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={linePoints} />
      </svg>
    </div>
  );
}

function ModelBars({ models }: { models: ModelBreakdownItem[] }) {
  if (models.length === 0) {
    return <div className="empty-panel small">当前区间还没有模型消耗记录。</div>;
  }

  return (
    <div className="bars">
      {models.slice(0, 5).map((model) => (
        <div className="bar-item" key={`${model.name}-${model.lastSeen}`}>
          <div className="bar-meta">
            <span>{model.name}</span>
            <span>{`${model.share.toFixed(model.share >= 10 ? 0 : 1)}%`}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(6, Math.min(100, model.share))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
export function DashboardShell({ section = "dashboard" }: DashboardShellProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasBootstrappedRef = useRef(false);
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [siteDraft, setSiteDraft] = useState<SiteDraft>(createEmptySiteDraft());
  const [queryRange, setQueryRange] = useState<DashboardRange>(createDefaultRange());
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [dashboardMap, setDashboardMap] = useState<Record<string, DashboardData>>({});
  const [siteSummaryMap, setSiteSummaryMap] = useState<Record<string, SiteSummaryRow>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [keyword, setKeyword] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshingSiteId, setRefreshingSiteId] = useState<string | null>(null);
  const [isTestingDraft, setIsTestingDraft] = useState(false);
  const [granularity, setGranularity] = useState<"hourly" | "daily">("daily");
  const [modelQuery, setModelQuery] = useState("");
  const [, startTransition] = useTransition();

  const activeSite = useMemo(() => sites.find((site) => site.id === activeSiteId) ?? null, [sites, activeSiteId]);
  const activeData = activeSiteId ? dashboardMap[activeSiteId] ?? null : null;
  const orderedRows = useMemo(() => sites.map((site) => createSummary(site, siteSummaryMap[site.id])), [sites, siteSummaryMap]);
  const groupOptions = useMemo(() => Array.from(new Set(orderedRows.map((row) => getGroupLabel(row.group)))).sort((left, right) => left.localeCompare(right, "zh-CN")), [orderedRows]);
  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return orderedRows.filter((row) => {
      const rowGroup = getGroupLabel(row.group);
      const matchesGroup = groupFilter === "all" || rowGroup === groupFilter;
      const matchesKeyword = !normalizedKeyword || [row.name, row.host, row.baseUrl, rowGroup].join(" ").toLowerCase().includes(normalizedKeyword);
      return matchesGroup && matchesKeyword;
    });
  }, [orderedRows, keyword, groupFilter]);
  const activeTrend = activeData ? (granularity === "hourly" ? activeData.trend.hourly : activeData.trend.daily) : [];
  const filteredModels = useMemo(() => (activeData?.models ?? []).filter((model) => model.name.toLowerCase().includes(modelQuery.trim().toLowerCase())), [activeData, modelQuery]);
  const totalBalance = sumNullable(orderedRows, (row) => row.currentBalance);
  const totalPeriodQuota = sumNullable(orderedRows, (row) => row.periodQuota);
  const totalRequests = sumNullable(orderedRows, (row) => row.totalRequests);
  const readySiteCount = orderedRows.filter((row) => row.status === "ready").length;
  const errorSiteCount = orderedRows.filter((row) => row.status === "error").length;
  const lowBalanceCount = orderedRows.filter(isLowBalance).length;
  const rangeLabel = getRangeLabel(queryRange);
  const activePresetDays = RANGE_PRESETS.find((preset) => preset.days === getRangeSpanDays(queryRange))?.days ?? null;
  const topModel = activeData?.models[0] ?? null;

  const refreshSingleSite = useCallback(
    async (site: SiteConfig, options?: { range?: DashboardRange; activate?: boolean }) => {
      const range = options?.range ?? queryRange;
      const rangeError = validateRange(range);
      if (rangeError) {
        setNotice({ tone: "error", text: rangeError });
        return null;
      }

      setRefreshingSiteId(site.id);
      setSiteSummaryMap((current) => ({
        ...current,
        [site.id]: createSummary(site, { ...current[site.id], status: "loading", message: null }),
      }));

      try {
        const data = await requestDashboardPayload(buildRequestBody(site, range));
        startTransition(() => {
          setDashboardMap((current) => ({ ...current, [site.id]: data }));
          setSiteSummaryMap((current) => ({ ...current, [site.id]: buildSuccessSummary(site, data) }));
        });

        if (options?.activate) {
          setActiveSiteId(site.id);
        }

        return data;
      } catch (error) {
        const message = error instanceof Error ? error.message : "加载额度数据失败。";
        setSiteSummaryMap((current) => ({
          ...current,
          [site.id]: createSummary(site, { ...current[site.id], status: "error", message }),
        }));

        if (options?.activate) {
          setNotice({ tone: "error", text: message });
        }

        return null;
      } finally {
        setRefreshingSiteId((current) => (current === site.id ? null : current));
      }
    },
    [queryRange],
  );

  const refreshAllSites = useCallback(
    async (siteList = sites, range = queryRange, preferredActiveId = activeSiteId) => {
      if (!siteList.length) {
        setNotice({ tone: "error", text: "请先保存至少一个站点。" });
        return;
      }

      const rangeError = validateRange(range);
      if (rangeError) {
        setNotice({ tone: "error", text: rangeError });
        return;
      }

      setNotice(null);
      setIsRefreshingAll(true);
      const results = await Promise.all(siteList.map(async (site) => {
        try {
          const data = await requestDashboardPayload(buildRequestBody(site, range));
          return { site, ok: true as const, data };
        } catch (error) {
          return { site, ok: false as const, message: error instanceof Error ? error.message : "加载额度数据失败。" };
        }
      }));

      startTransition(() => {
        setDashboardMap((current) => {
          const next = { ...current };
          for (const result of results) {
            if (result.ok) {
              next[result.site.id] = result.data;
            }
          }
          return next;
        });

        setSiteSummaryMap(() => {
          const next: Record<string, SiteSummaryRow> = {};
          for (const result of results) {
            next[result.site.id] = result.ok ? buildSuccessSummary(result.site, result.data) : createSummary(result.site, { status: "error", message: result.message });
          }
          return next;
        });
      });

      const nextActiveId = results.find((result) => result.ok && result.site.id === preferredActiveId)?.site.id ?? results.find((result) => result.ok)?.site.id ?? preferredActiveId;
      if (nextActiveId) {
        setActiveSiteId(nextActiveId);
      }

      if (results.every((result) => !result.ok)) {
        setNotice({ tone: "error", text: "所有站点刷新失败，请检查地址、鉴权方式或 session 是否失效。" });
      }

      setIsRefreshingAll(false);
    },
    [sites, queryRange, activeSiteId],
  );
  useEffect(() => {
    if (hasBootstrappedRef.current) {
      return;
    }

    hasBootstrappedRef.current = true;

    const savedSitesRaw = window.localStorage.getItem(SITES_STORAGE_KEY);
    const savedRangeRaw = window.localStorage.getItem(RANGE_STORAGE_KEY);
    const savedActiveSiteId = window.localStorage.getItem(ACTIVE_SITE_STORAGE_KEY);
    const legacySingleConfig = window.localStorage.getItem(LEGACY_STORAGE_KEY);

    let nextSites: SiteConfig[] = [];
    let nextRange = createDefaultRange();

    try {
      const parsedRange = savedRangeRaw ? (JSON.parse(savedRangeRaw) as Partial<DashboardRange>) : null;
      nextRange = { ...nextRange, ...parsedRange };
    } catch {}

    try {
      const parsedSites = savedSitesRaw ? (JSON.parse(savedSitesRaw) as Partial<SiteConfig>[]) : [];
      if (Array.isArray(parsedSites)) {
        nextSites = parsedSites.flatMap((site) => {
          const normalizedSite = normalizeSiteConfig(site);
          return normalizedSite ? [normalizedSite] : [];
        });
      }
    } catch {
      nextSites = [];
    }

    if (!nextSites.length && legacySingleConfig) {
      try {
        const parsedLegacy = JSON.parse(legacySingleConfig) as Partial<{ baseUrl: string; authType: AuthType; authValue: string }>;
        if (parsedLegacy.baseUrl?.trim() && parsedLegacy.authValue?.trim()) {
          nextSites = [{
            id: generateSiteId(),
            name: deriveSiteName("", parsedLegacy.baseUrl),
            group: "",
            baseUrl: parsedLegacy.baseUrl,
            authType: parsedLegacy.authType ?? "authorization",
            authValue: parsedLegacy.authValue,
            userId: null,
            warningQuota: null,
          }];
        }
      } catch {
        nextSites = [];
      }
    }

    const nextActiveId = savedActiveSiteId && nextSites.some((site) => site.id === savedActiveSiteId) ? savedActiveSiteId : nextSites[0]?.id ?? null;

    setSites(nextSites);
    setQueryRange(nextRange);
    setActiveSiteId(nextActiveId);
    setSiteDraft(nextActiveId ? siteToDraft(nextSites.find((site) => site.id === nextActiveId) ?? nextSites[0]) : createEmptySiteDraft());
    setIsHydrated(true);

    if (nextSites.length) {
      void refreshAllSites(nextSites, nextRange, nextActiveId);
    }
  }, [refreshAllSites]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(SITES_STORAGE_KEY, JSON.stringify(sites));
    window.localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(queryRange));

    if (activeSiteId) {
      window.localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, activeSiteId);
    } else {
      window.localStorage.removeItem(ACTIVE_SITE_STORAGE_KEY);
    }
  }, [sites, queryRange, activeSiteId, isHydrated]);

  useEffect(() => {
    if (!activeData) {
      return;
    }

    setGranularity(activeData.connection.spanDays > 7 ? "daily" : "hourly");
  }, [activeData]);

  function setDraftField<Key extends keyof SiteDraft>(key: Key, value: SiteDraft[Key]) {
    setSiteDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSelectSite(siteId: string) {
    const site = sites.find((item) => item.id === siteId);
    if (!site) {
      return;
    }

    setActiveSiteId(siteId);
    setSiteDraft(siteToDraft(site));
    setNotice(null);
  }

  async function handleSaveSite() {
    const { site: nextSite, error } = buildSiteFromDraft(siteDraft);
    if (!nextSite) {
      setNotice({ tone: "error", text: error ?? "站点信息不完整。" });
      return;
    }

    setSites((current) => {
      const exists = current.some((site) => site.id === nextSite.id);
      return exists ? current.map((site) => (site.id === nextSite.id ? nextSite : site)) : [nextSite, ...current];
    });
    setActiveSiteId(nextSite.id);
    setSiteDraft(siteToDraft(nextSite));

    const data = await refreshSingleSite(nextSite, { activate: true });
    if (data) {
      setNotice({ tone: "success", text: `站点“${nextSite.name}”已保存并同步完成。` });
    }
  }

  async function handleTestDraftSite() {
    const { site: draftSite, error } = buildSiteFromDraft(siteDraft);
    if (!draftSite) {
      setNotice({ tone: "error", text: error ?? "站点信息不完整。" });
      return;
    }

    setIsTestingDraft(true);
    try {
      const data = await requestDashboardPayload(buildRequestBody(draftSite, queryRange));
      setNotice({ tone: "success", text: `连接测试成功：${data.user.displayName || data.user.username}。` });
    } catch (testError) {
      setNotice({ tone: "error", text: testError instanceof Error ? testError.message : "测试连接失败。" });
    } finally {
      setIsTestingDraft(false);
    }
  }

  function handleCreateDraft() {
    setSiteDraft(createEmptySiteDraft());
    setNotice(null);
  }

  function handleEditSite(siteId: string) {
    handleSelectSite(siteId);
    if (section !== "sites") {
      router.push(SECTION_PATH_MAP.sites);
    }
  }

  function handleDeleteSite(siteId: string) {
    const site = sites.find((item) => item.id === siteId);
    if (!site) {
      return;
    }

    if (!window.confirm(`确认删除站点“${site.name}”吗？这只会删除当前浏览器里的本地配置。`)) {
      return;
    }

    setSites((current) => current.filter((item) => item.id !== siteId));
    setNotice({ tone: "success", text: `站点“${site.name}”已删除。` });
  }
  function handleDuplicateSite(siteId: string) {
    const site = sites.find((item) => item.id === siteId);
    if (!site) {
      return;
    }

    const duplicate: SiteConfig = { ...site, id: generateSiteId(), name: `${site.name} 副本` };
    setSites((current) => [duplicate, ...current]);
    setSiteDraft(siteToDraft(duplicate));
    setActiveSiteId(duplicate.id);
    setNotice({ tone: "success", text: `已复制站点“${site.name}”。` });
  }

  function jumpToSection(nextSection: DashboardSection, siteId?: string) {
    if (siteId) {
      handleSelectSite(siteId);
    }

    if (section !== nextSection) {
      router.push(SECTION_PATH_MAP[nextSection]);
    }
  }

  async function handleApplyPreset(days: number) {
    const nextRange = createRangeByDays(days);
    setQueryRange(nextRange);
    if (sites.length > 0) {
      await refreshAllSites(sites, nextRange, activeSiteId);
    }
  }

  function handleExportConfig() {
    if (sites.length === 0) {
      setNotice({ tone: "error", text: "当前没有可导出的站点配置。" });
      return;
    }

    const blob = new Blob([JSON.stringify(sites, null, 2)], { type: "application/json;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `newapi-sites-config-${Date.now()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportConfig(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as Partial<SiteConfig>[];
      if (!Array.isArray(parsed)) {
        throw new Error("导入文件格式不正确，请提供 JSON 数组。" );
      }

      const importedSites = parsed.flatMap((item) => {
        const normalized = normalizeSiteConfig(item);
        return normalized ? [{ ...normalized, id: generateSiteId() }] : [];
      });

      if (!importedSites.length) {
        throw new Error("文件中没有可导入的站点配置。" );
      }

      const nextSites = [...importedSites, ...sites];
      setSites(nextSites);
      setActiveSiteId(importedSites[0].id);
      setSiteDraft(siteToDraft(importedSites[0]));
      setNotice({ tone: "success", text: `已导入 ${importedSites.length} 个站点配置。` });
      await refreshAllSites(nextSites, queryRange, importedSites[0].id);
    } catch (importError) {
      setNotice({ tone: "error", text: importError instanceof Error ? importError.message : "导入配置失败。" });
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="proto-dashboard">
      <div className="topbar">
        <div className="brand">
          <h1>NewAPI 额度统计平台</h1>
          <p>按你给的原型拆成分页面结构，统一管理多站点配置、余额表和活动站点洞察。</p>
        </div>
        <div className="toolbar">
          {SECTION_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.section} href={SECTION_PATH_MAP[item.section]} className={`chip nav-chip ${section === item.section ? "active" : ""}`}>
                <Icon className="size-4" />
                {item.shortLabel}
              </Link>
            );
          })}
          <span className="chip">站点 {formatNumber(sites.length)}</span>
          <span className="chip">已同步 {formatNumber(readySiteCount)}</span>
          <span className="chip">区间 {rangeLabel}</span>
          <button type="button" className="btn primary" onClick={() => void refreshAllSites()} disabled={sites.length === 0 || isRefreshingAll}>
            {isRefreshingAll ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            刷新全部
          </button>
        </div>
      </div>

      {notice ? <div className={`banner ${notice.tone}`}>{notice.text}</div> : null}

      <div className="container">
        {section === "dashboard" ? (
          <>
            <div className="intro">
              <div className="hero">
                <h2>产品原型拆分</h2>
                <p>首页现在只负责总览，站点管理、余额表和活动站点详情都拆到了独立页面。后续就沿着你给的这套 UI 继续演进。</p>
                <div className="tag-list">
                  <span className="tag">多实例额度集中查看</span>
                  <span className="tag">支持三种鉴权</span>
                  <span className="tag">24h / 7d / 30d 区间切换</span>
                  <span className="tag">分组管理 + 搜索 + 排序</span>
                </div>
              </div>
              <div className="notes">
                <h3>当前页面说明</h3>
                <ul>
                  <li>先看总余额、区间消耗、低余额站点和总请求数。</li>
                  <li>左侧快速切站点，右侧继续下钻活动站点趋势与信号。</li>
                  <li>需要改配置时直接切到“站点管理”，不再放在一个超长页面里。</li>
                </ul>
              </div>
            </div>

            <section className="screen">
              <div className="screen-header">
                <div>
                  <div className="title">Dashboard 总览</div>
                  <div className="meta">目标：把总余额、低余额站点、总消耗和活动站点详情入口聚合在一屏。</div>
                </div>
                <div className="badge">当前区间：{rangeLabel}</div>
              </div>
              <div className="layout">
                <aside className="sidebar">
                  <div className="nav-group">
                    <div className="nav-label">导航</div>
                    {SECTION_NAV_ITEMS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button key={item.section} type="button" className={`nav-item ${section === item.section ? "active" : ""}`} onClick={() => jumpToSection(item.section)}>
                          <Icon className="size-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="nav-group">
                    <div className="nav-label">活动站点</div>
                    {sites.slice(0, 6).map((site) => (
                      <button key={site.id} type="button" className={`nav-item ${activeSiteId === site.id ? "active" : ""}`} onClick={() => handleSelectSite(site.id)}>
                        <Server className="size-4" />
                        {site.name}
                      </button>
                    ))}
                    {sites.length === 0 ? <div className="tiny">还没有保存站点，先去站点管理页新增一个。</div> : null}
                  </div>
                </aside>
                <div className="main">
                  <div className="filters">
                    <label className="input-shell search">
                      <Search className="size-4 text-[var(--muted)]" />
                      <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索站点 / Host / 分组" />
                    </label>
                    <select className="select-shell" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                      <option value="all">分组：全部</option>
                      {groupOptions.map((group) => <option key={group} value={group}>分组：{group}</option>)}
                    </select>
                    {RANGE_PRESETS.map((preset) => (
                      <button key={preset.days} type="button" className={`select-shell ${activePresetDays === preset.days ? "selected" : ""}`} onClick={() => void handleApplyPreset(preset.days)}>
                        时间：{preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="row cards-4">
                    <div className="card"><h4>总余额</h4><div className="metric">{formatNumber(totalBalance ?? 0)}</div><div className="delta">全部站点当前可用额度合计</div></div>
                    <div className="card"><h4>{rangeLabel}总消耗</h4><div className="metric">{formatNumber(totalPeriodQuota ?? 0)}</div><div className="delta good">基于当前筛选区间统计</div></div>
                    <div className="card"><h4>低余额站点</h4><div className="metric bad">{formatNumber(lowBalanceCount)}</div><div className="delta">低于各自阈值的站点数量</div></div>
                    <div className="card"><h4>总请求数</h4><div className="metric">{formatCompactNumber(totalRequests ?? 0)}</div><div className="delta">当前已接入站点的累计请求量</div></div>
                  </div>
                  <div className="row two spaced">
                    <div className="card">
                      <h4>额度趋势（活动站点）</h4>
                      <TrendSvg data={activeData ? activeTrend : []} accent="blue" />
                      <div className="tiny chart-footnote">当前站点：{activeSite?.name || "未选择站点"}</div>
                    </div>
                    <div className="card">
                      <h4>模型消耗排行</h4>
                      <ModelBars models={activeData?.models ?? []} />
                    </div>
                  </div>

                  <div className="row two spaced">
                    <div className="card">
                      <h4>多站点快速状态</h4>
                      {filteredRows.length > 0 ? (
                        <table>
                          <thead>
                            <tr>
                              <th>站点</th>
                              <th>分组</th>
                              <th>当前余额</th>
                              <th>区间消耗</th>
                              <th>请求数</th>
                              <th>状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRows.slice(0, 5).map((row) => (
                              <tr key={row.id} className={isLowBalance(row) ? "low-balance" : ""}>
                                <td><button type="button" className="table-link" onClick={() => jumpToSection("insights", row.id)}>{row.name}</button></td>
                                <td>{getGroupLabel(row.group)}</td>
                                <td>{formatNumber(row.currentBalance ?? 0)}</td>
                                <td>{formatNumber(row.periodQuota ?? 0)}</td>
                                <td>{formatCompactNumber(row.totalRequests ?? 0)}</td>
                                <td><span className="badge status success">{getStatusLabel(row)}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="empty-panel small">先保存并同步一个站点，这里就会展示多站点快速状态。</div>
                      )}
                    </div>
                    <div className="card">
                      <h4>账户信号</h4>
                      <div className="signal-list">
                        <div className="signal"><strong className={lowBalanceCount > 0 ? "warn" : "good"}>{lowBalanceCount > 0 ? "低余额提醒" : "余额状态稳定"}</strong><p>{lowBalanceCount > 0 ? `${lowBalanceCount} 个站点余额已低于自定义阈值，建议优先处理测试或备用站点。` : "当前没有站点触发低余额预警，整体额度状态较稳定。"}</p></div>
                        <div className="signal"><strong className={errorSiteCount > 0 ? "bad" : "good"}>{errorSiteCount > 0 ? "同步异常" : "请求量稳定"}</strong><p>{errorSiteCount > 0 ? `${errorSiteCount} 个站点最近一次同步失败，请检查鉴权方式、地址或 Cookie 是否失效。` : "当前请求量波动较平稳，没有出现明显异常冲高。"}</p></div>
                        <div className="signal"><strong className={topModel && topModel.share >= 45 ? "bad" : ""}>{topModel && topModel.share >= 45 ? "模型消耗集中" : "模型分布概览"}</strong><p>{topModel ? `${topModel.name} 当前占比 ${topModel.share.toFixed(topModel.share >= 10 ? 0 : 1)}%，适合继续下钻到活动站点详情里查看调用来源。` : "先同步一个站点，这里会根据模型分布给出使用信号。"}</p></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {section === "sites" ? (
          <section className="screen">
            <div className="screen-header">
              <div>
                <div className="title">站点管理</div>
                <div className="meta">目标：低成本维护多个实例配置，并保留本地导入、导出和独立阈值管理能力。</div>
              </div>
              <div className="badge">localStorage 本地保存</div>
            </div>
            <div className="layout">
              <aside className="sidebar">
                <div className="nav-group">
                  <div className="nav-label">导航</div>
                  {SECTION_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return <button key={item.section} type="button" className={`nav-item ${section === item.section ? "active" : ""}`} onClick={() => jumpToSection(item.section)}><Icon className="size-4" />{item.label}</button>;
                  })}
                </div>
                <div className="nav-group">
                  <div className="nav-label">站点分组</div>
                  <div className="nav-item active">全部站点（{sites.length}）</div>
                  {groupOptions.map((group) => <div key={group} className="nav-item">{group}</div>)}
                </div>
                <div className="nav-group">
                  <div className="nav-label">快捷操作</div>
                  <button type="button" className="nav-item active" onClick={handleCreateDraft}>新增站点</button>
                  <button type="button" className="nav-item" onClick={() => fileInputRef.current?.click()}>导入配置</button>
                  <button type="button" className="nav-item" onClick={handleExportConfig}>导出配置</button>
                </div>
                <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void handleImportConfig(event)} />
              </aside>
              <div className="main">
                <div className="row two">
                  <div className="card">
                    <h4>新增 / 编辑站点</h4>
                    <div className="form-grid">
                      <div className="field"><label htmlFor="site-name">站点名称</label><input id="site-name" className="control-input" placeholder="例：nan.meta-api.vip" value={siteDraft.name} onChange={(event) => setDraftField("name", event.target.value)} /></div>
                      <div className="field"><label htmlFor="site-group">分组</label><input id="site-group" className="control-input" placeholder="主站 / 商用 / 测试" value={siteDraft.group} onChange={(event) => setDraftField("group", event.target.value)} /></div>
                      <div className="field"><label htmlFor="base-url">站点地址</label><input id="base-url" className="control-input" placeholder="https://your-newapi.example.com" value={siteDraft.baseUrl} onChange={(event) => setDraftField("baseUrl", event.target.value)} /></div>
                      <div className="field"><label htmlFor="auth-type">鉴权方式</label><select id="auth-type" className="control-select" value={siteDraft.authType} onChange={(event) => setDraftField("authType", event.target.value as AuthType)}>{AUTH_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                      <div className="field span-2"><label htmlFor="auth-value">鉴权值</label><input id="auth-value" className="control-input" placeholder={getAuthPlaceholder(siteDraft.authType)} value={siteDraft.authValue} onChange={(event) => setDraftField("authValue", event.target.value)} /></div>
                      <div className="field"><label htmlFor="user-id">用户 ID / New-Api-User</label><input id="user-id" className="control-input" placeholder="例如：128" value={siteDraft.userId} onChange={(event) => setDraftField("userId", event.target.value)} /></div>
                      <div className="field"><label htmlFor="warning-quota">低余额阈值</label><input id="warning-quota" type="number" min="0" step="1" inputMode="decimal" className="control-input" placeholder="例如：5000" value={siteDraft.warningQuota} onChange={(event) => setDraftField("warningQuota", event.target.value)} /></div>
                    </div>
                    <div className="button-row">
                      <button type="button" className="btn primary" onClick={() => void handleSaveSite()}>{siteDraft.id ? "更新站点" : "保存站点"}</button>
                      <button type="button" className="btn" onClick={() => void handleTestDraftSite()} disabled={isTestingDraft}>{isTestingDraft ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}测试连接</button>
                      <button type="button" className="btn" onClick={handleCreateDraft}>清空表单</button>
                    </div>
                  </div>
                  <div className="card">
                    <h4>配置说明</h4>
                    <div className="signal-list">
                      <div className="signal"><strong>鉴权方式</strong><p>统一支持 Authorization、session、New-Api-User 三种模式，兼容不同的 NewAPI 部署方式。</p></div>
                      <div className="signal"><strong>本地存储</strong><p>所有站点配置只保存在当前浏览器 localStorage，不依赖数据库，适合个人额度巡检场景。</p></div>
                      <div className="signal"><strong>预警阈值</strong><p>每个站点都可以设置独立的低余额阈值，之后会在余额表和状态卡片里统一高亮提醒。</p></div>
                    </div>
                  </div>
                </div>
                <div className="card spaced-card">
                  <h4>已保存站点</h4>
                  {sites.length > 0 ? (
                    <div className="site-list">
                      {sites.map((site) => {
                        const row = orderedRows.find((item) => item.id === site.id) ?? createSummary(site);
                        return (
                          <div className="site-item" key={site.id}>
                            <div>
                              <strong>{site.name}</strong>
                              <div className="site-meta">分组：{getGroupLabel(site.group)} · 鉴权：{getAuthTypeLabel(site.authType)} · 阈值：{site.warningQuota === null ? "未设置" : formatNumber(site.warningQuota)}</div>
                              <div className="site-meta">Host：{parseHost(site.baseUrl)} · 状态：{getStatusLabel(row)}</div>
                            </div>
                            <div className="site-actions">
                              <button type="button" className="btn" onClick={() => handleEditSite(site.id)}><PencilLine className="size-4" />编辑</button>
                              <button type="button" className="btn" onClick={() => handleDuplicateSite(site.id)}><Copy className="size-4" />复制</button>
                              <button type="button" className="btn danger" onClick={() => handleDeleteSite(site.id)}><Trash2 className="size-4" />删除</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-panel small">当前还没有保存任何站点配置，先填写上面的表单保存一个站点。</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {section === "board" ? (
          <section className="screen">
            <div className="screen-header">
              <div>
                <div className="title">多站点余额表</div>
                <div className="meta">目标：把多站点运营管理常用动作收拢在一张表里完成，支持搜索、筛选、排序和导出。</div>
              </div>
              <div className="badge">支持 CSV / Excel 导出</div>
            </div>
            <div className="main">
              <SiteBalanceTable
                rows={orderedRows}
                activeSiteId={activeSiteId}
                isRefreshingAll={isRefreshingAll}
                refreshingSiteId={refreshingSiteId}
                range={queryRange}
                onSelect={(siteId) => jumpToSection("insights", siteId)}
                onEditSite={handleEditSite}
                onDeleteSite={handleDeleteSite}
                onRefreshSite={(siteId) => {
                  const site = sites.find((item) => item.id === siteId);
                  if (site) {
                    void refreshSingleSite(site, { activate: activeSiteId === siteId });
                  }
                }}
                onRefreshAll={() => void refreshAllSites()}
              />
            </div>
          </section>
        ) : null}

        {section === "insights" ? (
          <section className="screen">
            <div className="screen-header">
              <div>
                <div className="title">活动站点详情</div>
                <div className="meta">目标：单站点深度查看，保留区间趋势、模型消耗、账户信号和基础配置信息。</div>
              </div>
              <div className="badge">当前站点：{activeSite?.name || "未选择"}</div>
            </div>
            <div className="main">
              <div className="filters">
                <label className="select-shell icon-shell wide-select">
                  <Server className="size-4" />
                  <select value={activeSiteId ?? ""} onChange={(event) => handleSelectSite(event.target.value)}>
                    {sites.length === 0 ? <option value="">站点切换：暂无站点</option> : null}
                    {sites.map((site) => <option key={site.id} value={site.id}>站点切换：{site.name}</option>)}
                  </select>
                </label>
                {RANGE_PRESETS.map((preset) => <button key={preset.days} type="button" className={`select-shell ${activePresetDays === preset.days ? "selected" : ""}`} onClick={() => void handleApplyPreset(preset.days)}>区间：{preset.label}</button>)}
                <button type="button" className="btn" disabled={!activeSite || refreshingSiteId === activeSite.id} onClick={() => activeSite && void refreshSingleSite(activeSite, { activate: true })}>{activeSite && refreshingSiteId === activeSite.id ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}手动刷新</button>
              </div>

              {activeSite && activeData ? (
                <>
                  <div className="row cards-3">
                    <div className="card"><h4>当前余额</h4><div className="metric">{formatNumber(activeData.overview.currentBalance)}</div><div className="delta">来源：/api/user/self → quota</div></div>
                    <div className="card"><h4>历史已用</h4><div className="metric">{formatNumber(activeData.overview.historicalUsage)}</div><div className="delta">来源：/api/user/self → used_quota</div></div>
                    <div className="card"><h4>累计请求数</h4><div className="metric">{formatCompactNumber(activeData.overview.totalRequests)}</div><div className="delta">来源：/api/user/self → request_count</div></div>
                  </div>

                  <div className="row two spaced">
                    <TrendChart data={activeTrend} granularity={granularity} onGranularityChange={setGranularity} />
                    <div className="card">
                      <h4>账户信号面板</h4>
                      <div className="signal-list">
                        <div className="signal"><strong className={activeSite.warningQuota !== null && activeData.overview.currentBalance <= activeSite.warningQuota ? "warn" : "good"}>{activeSite.warningQuota !== null && activeData.overview.currentBalance <= activeSite.warningQuota ? "余额低于阈值" : "余额充足"}</strong><p>{activeSite.warningQuota !== null ? `当前阈值：${formatNumber(activeSite.warningQuota)}，估算续航：${formatRunway(activeData.overview.estimatedRunwayDays)}。` : "当前站点未设置低余额阈值，但余额仍处于可接受区间。"}</p></div>
                        <div className="signal"><strong className={topModel && topModel.share >= 40 ? "warn" : "good"}>{topModel && topModel.share >= 40 ? "高价模型占比较高" : "模型分布健康"}</strong><p>{topModel ? `${topModel.name} 当前占比 ${topModel.share.toFixed(topModel.share >= 10 ? 0 : 1)}%，适合继续查看模型明细。` : "当前区间还没有模型消耗记录。"}</p></div>
                        <div className="signal"><strong>接口信息</strong><p>当前页面通过服务端代理访问 /api/user/self 与 /api/data/self，避免浏览器直接跨域请求。</p></div>
                      </div>
                    </div>
                  </div>

                  <div className="row two spaced">
                    <ModelBreakdown models={filteredModels} query={modelQuery} onQueryChange={setModelQuery} />
                    <div className="card">
                      <h4>站点基础信息</h4>
                      <table>
                        <tbody>
                          <tr><td>站点名称</td><td>{activeSite.name}</td></tr>
                          <tr><td>分组</td><td>{getGroupLabel(activeSite.group)}</td></tr>
                          <tr><td>Host</td><td>{parseHost(activeSite.baseUrl)}</td></tr>
                          <tr><td>鉴权方式</td><td>{getAuthTypeLabel(activeSite.authType)}</td></tr>
                          <tr><td>低余额阈值</td><td>{activeSite.warningQuota === null ? "未设置" : formatNumber(activeSite.warningQuota)}</td></tr>
                          <tr><td>最后同步</td><td>{formatTimestampLabel(Math.floor(new Date(activeData.connection.lastSyncedAt).getTime() / 1000))}</td></tr>
                          <tr><td>区间使用率</td><td>{formatPercent(activeData.overview.usageRate)}</td></tr>
                          <tr><td>活跃模型数</td><td>{formatNumber(activeData.overview.activeModels)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-panel">当前还没有活动站点详情。先保存并同步一个站点，然后再进入这里查看区间趋势与模型分析。</div>
              )}
            </div>
          </section>
        ) : null}

        <div className="footer">这版已经按你给的静态原型改成分页面结构；后续再做交互细化时也会沿用这套 UI 语言。</div>
      </div>
    </main>
  );
}
