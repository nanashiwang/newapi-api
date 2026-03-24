"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Activity,
  CalendarRange,
  Clock3,
  Flame,
  Gauge,
  Layers3,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Rows3,
  ScanLine,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCircle2,
  Wallet,
} from "lucide-react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { ModelBreakdown } from "@/components/dashboard/model-breakdown";
import { SiteBalanceTable } from "@/components/dashboard/site-balance-table";
import { TrendChart } from "@/components/dashboard/trend-chart";
import type {
  AuthType,
  DashboardData,
  DashboardRange,
  DashboardRequest,
  SiteConfig,
  SiteSummaryRow,
} from "@/lib/dashboard-types";
import {
  formatCompactNumber,
  formatDateInput,
  formatNumber,
  formatPercent,
  formatRunway,
  formatTimestampLabel,
  formatUsd,
  shiftDate,
} from "@/lib/formatters";

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
  | {
      success: true;
      data: DashboardData;
    }
  | {
      success: false;
      message: string;
    };

const LEGACY_STORAGE_KEY = "newapi-quota-dashboard:connection";
const SITES_STORAGE_KEY = "newapi-quota-dashboard:sites";
const RANGE_STORAGE_KEY = "newapi-quota-dashboard:range";
const ACTIVE_SITE_STORAGE_KEY = "newapi-quota-dashboard:active-site";

const AUTH_MODE_OPTIONS: Array<{ value: AuthType; label: string }> = [
  { value: "authorization", label: "Authorization" },
  { value: "session", label: "session" },
  { value: "new-api-user", label: "New-Api-User" },
];

const RANGE_PRESETS = [
  { label: "24 小时", days: 1 },
  { label: "7 天", days: 7 },
  { label: "30 天", days: 30 },
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

function createDefaultRange(): DashboardRange {
  const today = new Date();

  return {
    startDate: formatDateInput(shiftDate(today, -6)),
    endDate: formatDateInput(today),
  };
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
    warningQuota: site.warningQuota === null ? "" : `${site.warningQuota}`,
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
  const trimmed = name.trim();
  if (trimmed) {
    return trimmed;
  }

  return parseHost(baseUrl);
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

function parseWarningQuotaInput(rawValue: string): {
  value: number | null;
  error: string | null;
} {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return {
      value: null,
      error: null,
    };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      value: null,
      error: "低余额阈值必须是大于等于 0 的数字。",
    };
  }

  return {
    value: parsed,
    error: null,
  };
}

function normalizeOptionalText(rawValue: unknown): string | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : null;
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

async function requestDashboardPayload(
  requestBody: DashboardRequest,
): Promise<DashboardData> {
  const response = await fetch("/api/dashboard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const result = (await response.json()) as DashboardApiResponse;

  if (!response.ok || !result.success) {
    throw new Error(
      "message" in result ? result.message : "加载额度数据失败。",
    );
  }

  return result.data;
}

function createSummary(
  site: SiteConfig,
  overrides: Partial<SiteSummaryRow> = {},
): SiteSummaryRow {
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

export function DashboardShell() {
  const hasBootstrappedRef = useRef(false);
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [siteDraft, setSiteDraft] = useState<SiteDraft>(createEmptySiteDraft());
  const [queryRange, setQueryRange] = useState<DashboardRange>(createDefaultRange());
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [dashboardMap, setDashboardMap] = useState<Record<string, DashboardData>>(
    {},
  );
  const [siteSummaryMap, setSiteSummaryMap] = useState<
    Record<string, SiteSummaryRow>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [granularity, setGranularity] = useState<"hourly" | "daily">("daily");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshingSiteId, setRefreshingSiteId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const deferredModelQuery = useDeferredValue(modelQuery);

  const activeSite = useMemo(
    () => sites.find((site) => site.id === activeSiteId) ?? null,
    [sites, activeSiteId],
  );

  const activeData = activeSiteId ? dashboardMap[activeSiteId] ?? null : null;

  const orderedRows = useMemo(
    () => sites.map((site) => createSummary(site, siteSummaryMap[site.id])),
    [sites, siteSummaryMap],
  );

  const filteredModels = useMemo(
    () =>
      (activeData?.models ?? []).filter((model) =>
        model.name.toLowerCase().includes(deferredModelQuery.trim().toLowerCase()),
      ),
    [activeData, deferredModelQuery],
  );

  const activeTrend = activeData
    ? granularity === "hourly"
      ? activeData.trend.hourly
      : activeData.trend.daily
    : [];

  const peakMoments = useMemo(
    () =>
      [...(activeData?.trend.hourly ?? [])]
        .sort((left, right) => right.quota - left.quota)
        .slice(0, 4),
    [activeData],
  );

  const refreshSingleSite = useCallback(
    async (
      site: SiteConfig,
      options?: {
        range?: DashboardRange;
        activate?: boolean;
      },
    ) => {
      const range = options?.range ?? queryRange;
      const rangeError = validateRange(range);
      if (rangeError) {
        setErrorMessage(rangeError);
        return;
      }

      setErrorMessage(null);
      setRefreshingSiteId(site.id);
      setSiteSummaryMap((current) => ({
        ...current,
        [site.id]: createSummary(site, {
          ...current[site.id],
          status: "loading",
          message: null,
        }),
      }));

      try {
        const data = await requestDashboardPayload(buildRequestBody(site, range));

        startTransition(() => {
          setDashboardMap((current) => ({
            ...current,
            [site.id]: data,
          }));
          setSiteSummaryMap((current) => ({
            ...current,
            [site.id]: buildSuccessSummary(site, data),
          }));
        });

        if (options?.activate) {
          setActiveSiteId(site.id);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "加载额度数据失败。";

        setSiteSummaryMap((current) => ({
          ...current,
          [site.id]: createSummary(site, {
            ...current[site.id],
            status: "error",
            message,
          }),
        }));

        if (options?.activate) {
          setErrorMessage(message);
        }
      } finally {
        setRefreshingSiteId((current) => (current === site.id ? null : current));
      }
    },
    [queryRange],
  );

  const refreshAllSites = useCallback(
    async (
      siteList = sites,
      range = queryRange,
      preferredActiveId = activeSiteId,
    ) => {
      if (!siteList.length) {
        setErrorMessage("请先保存至少一个站点。");
        return;
      }

      const rangeError = validateRange(range);
      if (rangeError) {
        setErrorMessage(rangeError);
        return;
      }

      setErrorMessage(null);
      setIsRefreshingAll(true);
      setRefreshingSiteId(null);

      setSiteSummaryMap((current) => {
        const next: Record<string, SiteSummaryRow> = {};
        for (const site of siteList) {
          next[site.id] = createSummary(site, {
            ...current[site.id],
            status: "loading",
            message: null,
          });
        }
        return next;
      });

      const results = await Promise.all(
        siteList.map(async (site) => {
          try {
            const data = await requestDashboardPayload(buildRequestBody(site, range));
            return {
              site,
              ok: true as const,
              data,
            };
          } catch (error) {
            return {
              site,
              ok: false as const,
              message:
                error instanceof Error ? error.message : "加载额度数据失败。",
            };
          }
        }),
      );

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
            next[result.site.id] = result.ok
              ? buildSuccessSummary(result.site, result.data)
              : createSummary(result.site, {
                  status: "error",
                  message: result.message,
                });
          }
          return next;
        });
      });

      const preferredSuccess = results.find(
        (result) => result.ok && result.site.id === preferredActiveId,
      );
      const firstSuccess = results.find((result) => result.ok);
      const nextActiveId =
        preferredSuccess?.site.id ?? firstSuccess?.site.id ?? preferredActiveId;

      if (nextActiveId) {
        setActiveSiteId(nextActiveId);
      }

      if (results.every((result) => !result.ok)) {
        setErrorMessage(
          "所有站点刷新失败，请检查地址、鉴权方式或 session 是否失效。",
        );
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

    const nextDefaultRange = createDefaultRange();
    const savedSitesRaw = window.localStorage.getItem(SITES_STORAGE_KEY);
    const savedRangeRaw = window.localStorage.getItem(RANGE_STORAGE_KEY);
    const savedActiveSiteId = window.localStorage.getItem(ACTIVE_SITE_STORAGE_KEY);
    const legacySingleConfig = window.localStorage.getItem(LEGACY_STORAGE_KEY);

    let nextSites: SiteConfig[] = [];
    let nextRange: DashboardRange = nextDefaultRange;

    try {
      const parsedRange = savedRangeRaw
        ? (JSON.parse(savedRangeRaw) as Partial<DashboardRange>)
        : null;
      nextRange = {
        ...nextDefaultRange,
        ...parsedRange,
      };
    } catch {
      nextRange = nextDefaultRange;
    }

    try {
      const parsedSites = savedSitesRaw
        ? (JSON.parse(savedSitesRaw) as Partial<SiteConfig>[])
        : [];
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
        const parsedLegacy = JSON.parse(legacySingleConfig) as Partial<{
          baseUrl: string;
          authType: AuthType;
          authValue: string;
        }>;

        if (parsedLegacy.baseUrl?.trim() && parsedLegacy.authValue?.trim()) {
          nextSites = [
            {
              id: generateSiteId(),
              name: deriveSiteName("", parsedLegacy.baseUrl),
              group: "",
              baseUrl: parsedLegacy.baseUrl,
              authType: parsedLegacy.authType ?? "authorization",
              authValue: parsedLegacy.authValue,
              userId: null,
              warningQuota: null,
            },
          ];
        }
      } catch {
        nextSites = [];
      }
    }

    const nextActiveId =
      savedActiveSiteId && nextSites.some((site) => site.id === savedActiveSiteId)
        ? savedActiveSiteId
        : nextSites[0]?.id ?? null;

    setSites(nextSites);
    setQueryRange(nextRange);
    setActiveSiteId(nextActiveId);

    if (nextActiveId) {
      const selectedSite = nextSites.find((site) => site.id === nextActiveId);
      setSiteDraft(selectedSite ? siteToDraft(selectedSite) : createEmptySiteDraft());
    } else {
      setSiteDraft(createEmptySiteDraft());
    }

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

  useEffect(() => {
    const siteIds = new Set(sites.map((site) => site.id));

    setDashboardMap((current) => {
      const nextEntries = Object.entries(current).filter(([siteId]) => siteIds.has(siteId));
      return Object.fromEntries(nextEntries);
    });

    setSiteSummaryMap((current) => {
      const nextEntries = Object.entries(current).filter(([siteId]) => siteIds.has(siteId));
      return Object.fromEntries(nextEntries);
    });

    if (activeSiteId && !siteIds.has(activeSiteId)) {
      setActiveSiteId(sites[0]?.id ?? null);
    }
  }, [sites, activeSiteId]);

  function applyPreset(days: number) {
    const today = new Date();
    setQueryRange({
      startDate: formatDateInput(shiftDate(today, -(days - 1))),
      endDate: formatDateInput(today),
    });
  }

  function handleSelectSite(siteId: string) {
    const site = sites.find((item) => item.id === siteId);
    if (!site) {
      return;
    }

    setActiveSiteId(siteId);
    setSiteDraft(siteToDraft(site));
  }

  async function handleSaveSite() {
    if (!siteDraft.baseUrl.trim()) {
      setErrorMessage("请填写 NewAPI 地址。");
      return;
    }

    if (!siteDraft.authValue.trim()) {
      setErrorMessage("请填写鉴权值。");
      return;
    }

    const warningQuotaState = parseWarningQuotaInput(siteDraft.warningQuota);
    if (warningQuotaState.error) {
      setErrorMessage(warningQuotaState.error);
      return;
    }

    const nextSite: SiteConfig = {
      id: siteDraft.id ?? generateSiteId(),
      name: deriveSiteName(siteDraft.name, siteDraft.baseUrl),
      group: siteDraft.group.trim(),
      baseUrl: siteDraft.baseUrl.trim(),
      authType: siteDraft.authType,
      authValue: siteDraft.authValue.trim(),
      userId: normalizeOptionalText(siteDraft.userId),
      warningQuota: warningQuotaState.value,
    };

    setErrorMessage(null);
    setSites((current) => {
      const exists = current.some((site) => site.id === nextSite.id);
      if (exists) {
        return current.map((site) => (site.id === nextSite.id ? nextSite : site));
      }
      return [nextSite, ...current];
    });
    setSiteDraft(siteToDraft(nextSite));
    setActiveSiteId(nextSite.id);
    setSiteSummaryMap((current) => ({
      ...current,
      [nextSite.id]: createSummary(nextSite, current[nextSite.id]),
    }));

    await refreshSingleSite(nextSite, { activate: true });
  }

  function handleCreateDraft() {
    setSiteDraft(createEmptySiteDraft());
  }

  function handleDeleteDraftSite() {
    if (!siteDraft.id) {
      setSiteDraft(createEmptySiteDraft());
      return;
    }

    const removingId = siteDraft.id;
    const remainingSites = sites.filter((site) => site.id !== removingId);
    const nextActiveId =
      activeSiteId === removingId ? remainingSites[0]?.id ?? null : activeSiteId;

    setSites(remainingSites);
    setActiveSiteId(nextActiveId);
    setSiteDraft(
      nextActiveId
        ? siteToDraft(remainingSites.find((site) => site.id === nextActiveId)!)
        : createEmptySiteDraft(),
    );

    setDashboardMap((current) => {
      const next = { ...current };
      delete next[removingId];
      return next;
    });

    setSiteSummaryMap((current) => {
      const next = { ...current };
      delete next[removingId];
      return next;
    });
  }

  function clearAllLocalConfigs() {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.localStorage.removeItem(SITES_STORAGE_KEY);
    window.localStorage.removeItem(RANGE_STORAGE_KEY);
    window.localStorage.removeItem(ACTIVE_SITE_STORAGE_KEY);

    setSites([]);
    setSiteDraft(createEmptySiteDraft());
    setQueryRange(createDefaultRange());
    setActiveSiteId(null);
    setDashboardMap({});
    setSiteSummaryMap({});
    setModelQuery("");
    setErrorMessage(null);
  }

  return (
    <main className="shell-container">
      <section className="surface-card relative overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(217,103,73,0.2),transparent_48%),radial-gradient(circle_at_top_right,rgba(15,118,110,0.18),transparent_40%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div>
            <span className="accent-pill">
              <Sparkles className="size-3.5" />
              Multi Site Quota Observatory
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-[#1d2529] sm:text-5xl">
              把多个 NewAPI 实例放进同一块额度看板里。
            </h1>
            <p className="muted-copy mt-4 max-w-2xl text-base sm:text-lg">
              现在不仅能看单站点明细，还能保存多个实例，在一个页面里做余额对比、跨站点切换和详细图表下钻。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-[1.75rem] border border-white/70 bg-[#f7faf8] p-5">
              <p className="stat-note">Multi Site</p>
              <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                本地保存多个 NewAPI 实例
              </p>
              <p className="mt-2 text-sm leading-6 text-[#5c6d71]">
                每个站点单独保存地址和鉴权信息，余额表统一展示，详细图表按活动站点切换。
              </p>
            </article>

            <article className="rounded-[1.75rem] border border-white/70 bg-[#fff7ed] p-5">
              <p className="stat-note">Guardrail</p>
              <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                单次查询最多 30 天
              </p>
              <p className="mt-2 text-sm leading-6 text-[#5c6d71]">
                保持和 NewAPI `/api/data/self` 接口约束一致，避免批量刷新时被上游直接拒绝。
              </p>
            </article>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="mt-6 rounded-[1.5rem] border border-[#d96749]/15 bg-[#fff2ee] px-5 py-4 text-sm text-[#a34d35]">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
        <aside className="surface-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="stat-note">Site Manager</p>
              <h2 className="section-title mt-2">站点管理</h2>
            </div>
            <ShieldCheck className="size-5 text-[#0f766e]" />
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label className="field-label" htmlFor="site-name">
                站点名称
              </label>
              <input
                id="site-name"
                className="field-input"
                placeholder="例如：主站 / 备用站 / 客户 A"
                value={siteDraft.name}
                onChange={(event) =>
                  setSiteDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="field-label" htmlFor="site-group">
                  站点分组
                </label>
                <input
                  id="site-group"
                  className="field-input"
                  placeholder="例如：生产 / 客户 A / 备用"
                  value={siteDraft.group}
                  onChange={(event) =>
                    setSiteDraft((current) => ({
                      ...current,
                      group: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="field-label" htmlFor="warning-quota">
                  低余额阈值
                </label>
                <input
                  id="warning-quota"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  className="field-input"
                  placeholder="例如：5000"
                  value={siteDraft.warningQuota}
                  onChange={(event) =>
                    setSiteDraft((current) => ({
                      ...current,
                      warningQuota: event.target.value,
                    }))
                  }
                />
                <p className="text-xs leading-5 text-[#7a898d]">
                  当余额小于等于该值时，余额表会自动高亮提醒。
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="field-label" htmlFor="base-url">
                NewAPI 地址
              </label>
              <input
                id="base-url"
                className="field-input"
                placeholder="https://your-newapi.example.com"
                value={siteDraft.baseUrl}
                onChange={(event) =>
                  setSiteDraft((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="field-label" htmlFor="auth-type">
                鉴权方式
              </label>
              <select
                id="auth-type"
                className="field-input"
                value={siteDraft.authType}
                onChange={(event) =>
                  setSiteDraft((current) => ({
                    ...current,
                    authType: event.target.value as AuthType,
                  }))
                }
              >
                {AUTH_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="field-label" htmlFor="auth-value">
                鉴权值
              </label>
              <input
                id="auth-value"
                type="password"
                className="field-input"
                placeholder={getAuthPlaceholder(siteDraft.authType)}
                value={siteDraft.authValue}
                onChange={(event) =>
                  setSiteDraft((current) => ({
                    ...current,
                    authValue: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="field-label" htmlFor="user-id">
                用户 ID / New-Api-User（可选）
              </label>
              <input
                id="user-id"
                inputMode="numeric"
                className="field-input"
                placeholder="如 onlycode.shop 这类站点可以填写 128"
                value={siteDraft.userId}
                onChange={(event) =>
                  setSiteDraft((current) => ({
                    ...current,
                    userId: event.target.value,
                  }))
                }
              />
              <p className="text-xs leading-5 text-[#7a898d]">
                如果站点的 `/api/user/self` 也要求 `New-Api-User`，请在这里手动填写用户 ID。
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-4">
              <div className="flex items-center gap-2">
                <CalendarRange className="size-4 text-[#d96749]" />
                <p className="text-sm font-semibold text-[#1d2529]">全局查询区间</p>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {RANGE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset.days)}
                      className="rounded-full border border-black/5 bg-white px-3 py-2 text-sm font-semibold text-[#4f5d62] transition hover:bg-[#f3eee4]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="field-label" htmlFor="start-date">
                      开始日期
                    </label>
                    <input
                      id="start-date"
                      type="date"
                      className="field-input"
                      value={queryRange.startDate}
                      onChange={(event) =>
                        setQueryRange((current) => ({
                          ...current,
                          startDate: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="field-label" htmlFor="end-date">
                      结束日期
                    </label>
                    <input
                      id="end-date"
                      type="date"
                      className="field-input"
                      value={queryRange.endDate}
                      onChange={(event) =>
                        setQueryRange((current) => ({
                          ...current,
                          endDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleSaveSite()}
              >
                <ShieldCheck className="size-4" />
                {siteDraft.id ? "更新站点" : "保存站点"}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={handleCreateDraft}
              >
                <Plus className="size-4" />
                新建草稿
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={!activeSite || refreshingSiteId === activeSite.id}
                onClick={() =>
                  activeSite && void refreshSingleSite(activeSite, { activate: true })
                }
              >
                {activeSite && refreshingSiteId === activeSite.id ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
                刷新当前
              </button>

              <button
                type="button"
                className="ghost-button"
                onClick={handleDeleteDraftSite}
              >
                <Trash2 className="size-4" />
                删除编辑站点
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1d2529]">已保存站点</p>
                <p className="mt-1 text-sm text-[#5c6d71]">
                  点击任意卡片即可切换活动站点并回填到表单。
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#5c6d71]">
                {sites.length} 个
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {sites.length > 0 ? (
                sites.map((site) => {
                  const isActive = site.id === activeSiteId;
                  const summary = siteSummaryMap[site.id];

                  return (
                    <button
                      key={site.id}
                      type="button"
                      onClick={() => handleSelectSite(site.id)}
                      className={`w-full rounded-[1.25rem] border px-4 py-3 text-left transition ${
                        isActive
                          ? "border-[#0f766e]/20 bg-white shadow-[0_10px_30px_-20px_rgba(15,118,110,0.45)]"
                          : "border-black/5 bg-white/70 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#1d2529]">{site.name}</p>
                          <p className="mt-1 text-xs text-[#5c6d71]">
                            {parseHost(site.baseUrl)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#6a777b]">
                            <span className="rounded-full bg-[#f3eee4] px-3 py-1">
                              {site.group || "未分组"}
                            </span>
                            {site.warningQuota !== null ? (
                              <span className="rounded-full bg-[#fff2ee] px-3 py-1 text-[#a34d35]">
                                阈值 {formatNumber(site.warningQuota)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="rounded-full bg-[#f3eee4] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#6a777b]">
                          {summary?.status === "ready"
                            ? "正常"
                            : summary?.status === "loading"
                              ? "刷新中"
                              : summary?.status === "error"
                                ? "异常"
                                : "待同步"}
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[1.25rem] bg-white/70 px-4 py-6 text-sm text-[#5c6d71]">
                  还没有保存任何站点，先把一个 NewAPI 实例保存下来。
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              className="ghost-button"
              onClick={clearAllLocalConfigs}
            >
              <Trash2 className="size-4" />
              清空全部本地配置
            </button>
          </div>
        </aside>

        <div className="grid gap-6">
          <SiteBalanceTable
            rows={orderedRows}
            activeSiteId={activeSiteId}
            isRefreshingAll={isRefreshingAll}
            refreshingSiteId={refreshingSiteId}
            range={queryRange}
            onSelect={handleSelectSite}
            onRefreshSite={(siteId) => {
              const site = sites.find((item) => item.id === siteId);
              if (site) {
                void refreshSingleSite(site, { activate: site.id === activeSiteId });
              }
            }}
            onRefreshAll={() => {
              void refreshAllSites();
            }}
          />

          <section className="surface-card p-6">
            <div className="flex flex-col gap-4 border-b border-black/5 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="stat-note">Active Site</p>
                <h2 className="section-title mt-2">
                  {activeSite?.name || "未选择站点"}
                </h2>
                <p className="muted-copy mt-2">
                  {activeSite
                    ? `当前正在查看 ${parseHost(activeSite.baseUrl)} 的详细额度画像和模型消耗。`
                    : "先从左侧保存一个站点，或在上方余额表里选择一个站点。"}
                </p>
              </div>

              {activeSite ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-[#f7f4ec] px-4 py-2 text-sm font-semibold text-[#4f5d62]">
                  <Rows3 className="size-4" />
                  {getAuthTypeLabel(activeSite.authType)}
                </div>
              ) : null}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <MetricCard
                icon={Wallet}
                tone="teal"
                label="当前余额"
                value={formatNumber(activeData?.overview.currentBalance ?? 0)}
                detail="来自 /api/user/self 的 quota 字段"
              />
              <MetricCard
                icon={Gauge}
                tone="amber"
                label="历史已用"
                value={formatNumber(activeData?.overview.historicalUsage ?? 0)}
                detail="来自 /api/user/self 的 used_quota 字段"
              />
              <MetricCard
                icon={Activity}
                tone="coral"
                label="累计请求"
                value={formatCompactNumber(activeData?.overview.totalRequests ?? 0)}
                detail="累计请求次数，适合观察整体调用密度"
              />
              <MetricCard
                icon={ScanLine}
                tone="slate"
                label="区间消耗"
                value={formatNumber(activeData?.overview.periodQuota ?? 0)}
                detail="所选时间范围内的额度消耗总和"
              />
              <MetricCard
                icon={Layers3}
                tone="teal"
                label="活跃模型"
                value={formatNumber(activeData?.overview.activeModels ?? 0)}
                detail="当前区间内出现过请求的模型数量"
              />
              <MetricCard
                icon={Flame}
                tone="amber"
                label="日均消耗"
                value={formatNumber(activeData?.overview.burnPerDay ?? 0)}
                detail="以当前查询区间为样本估算的平均日耗"
              />
              <MetricCard
                icon={Wallet}
                tone="slate"
                label="月卡总额"
                value={formatUsd(
                  activeData?.billing.hardLimitUsd ??
                    activeData?.billing.softLimitUsd ??
                    activeData?.billing.systemHardLimitUsd ??
                    null,
                )}
                detail={
                  activeData?.billing.message ??
                  "来自 /dashboard/billing/subscription 的 hard_limit_usd"
                }
              />
              <MetricCard
                icon={Gauge}
                tone="coral"
                label="月卡剩余"
                value={formatUsd(activeData?.billing.remainingUsd ?? null)}
                detail={
                  activeData?.billing.message ??
                  "按订阅总额减去 /dashboard/billing/usage 计算"
                }
              />
            </div>
          </section>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_360px]">
            <TrendChart
              data={activeTrend}
              granularity={granularity}
              onGranularityChange={setGranularity}
            />

            <section className="surface-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="stat-note">Signals</p>
                  <h2 className="section-title mt-2">账户信号</h2>
                </div>
                <UserCircle2 className="size-5 text-[#0f766e]" />
              </div>

              {activeData ? (
                <>
                  <div className="mt-6 rounded-[1.75rem] border border-black/5 bg-[#fbfaf5] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-[#1d2529]">
                          {activeData.user.displayName || activeData.user.username}
                        </p>
                        <p className="mt-1 text-sm text-[#5c6d71]">
                          {activeData.user.email || "未公开邮箱"}
                        </p>
                      </div>
                      <div className="rounded-full bg-[#e6f6f3] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f5c56]">
                        {activeData.user.roleLabel}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#5c6d71]">
                      <span className="rounded-full bg-white px-3 py-1">
                        状态：{activeData.user.statusLabel}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1">
                        分组：{activeData.user.group || "默认"}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1">
                        鉴权：{activeData.connection.authTypeLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <article className="rounded-[1.5rem] border border-black/5 bg-white/80 p-4">
                      <p className="field-label">余额续航</p>
                      <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-[#1d2529]">
                        {formatRunway(activeData.overview.estimatedRunwayDays)}
                      </p>
                      <p className="mt-2 text-sm text-[#5c6d71]">
                        以当前区间均值估算剩余额度还能支撑多久。
                      </p>
                    </article>

                    <article className="rounded-[1.5rem] border border-black/5 bg-white/80 p-4">
                      <p className="field-label">累计使用率</p>
                      <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-[#1d2529]">
                        {formatPercent(activeData.overview.usageRate)}
                      </p>
                      <p className="mt-2 text-sm text-[#5c6d71]">
                        按 used_quota / (quota + used_quota) 推算的累计消耗占比。
                      </p>
                    </article>

                    <article className="rounded-[1.5rem] border border-black/5 bg-white/80 p-4">
                      <p className="field-label">峰值时段</p>
                      <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-[#1d2529]">
                        {activeData.overview.peakLabel || "暂无"}
                      </p>
                      <p className="mt-2 text-sm text-[#5c6d71]">
                        在小时级数据里额度消耗最高的时间桶。
                      </p>
                    </article>

                    <article className="rounded-[1.5rem] border border-black/5 bg-white/80 p-4">
                      <p className="field-label">平均单次消耗</p>
                      <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-[#1d2529]">
                        {formatNumber(activeData.overview.averageQuotaPerRequest)}
                      </p>
                      <p className="mt-2 text-sm text-[#5c6d71]">
                        所选区间总额度除以区间请求数。
                      </p>
                    </article>
                  </div>

                  <div className="mt-6 rounded-[1.75rem] border border-black/5 bg-[#fbfaf5] p-5">
                    <div className="flex items-center gap-2">
                      <Clock3 className="size-4 text-[#d96749]" />
                      <p className="text-sm font-semibold text-[#1d2529]">
                        高峰时段 Top 4
                      </p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {peakMoments.length > 0 ? (
                        peakMoments.map((point) => (
                          <div
                            key={point.timestamp}
                            className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm"
                          >
                            <div>
                              <p className="font-semibold text-[#1d2529]">{point.label}</p>
                              <p className="mt-1 text-[#5c6d71]">
                                请求 {formatNumber(point.requests)} 次
                              </p>
                            </div>
                            <p className="font-semibold text-[#1d2529]">
                              {formatNumber(point.quota)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[#5c6d71]">暂无峰值数据。</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-6 flex min-h-[540px] items-center justify-center rounded-[1.75rem] bg-[#fbfaf5] text-center text-sm text-[#5c6d71]">
                  选择一个已同步站点后，这里会展示账户画像、续航估算和峰值时段。
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <ModelBreakdown
              models={filteredModels}
              query={modelQuery}
              onQueryChange={setModelQuery}
            />

            <section className="surface-card p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="stat-note">Connection Snapshot</p>
                  <h2 className="section-title mt-2">当前站点摘要</h2>
                </div>
                <Server className="size-5 text-[#0f766e]" />
              </div>

              {activeData ? (
                <div className="mt-6 space-y-4">
                  <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1d2529]">
                      <Server className="size-4 text-[#0f766e]" />
                      目标主机
                    </div>
                    <p className="mt-3 break-all text-sm leading-6 text-[#5c6d71]">
                      {activeData.connection.baseUrl}
                    </p>
                  </article>

                  <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1d2529]">
                      <CalendarRange className="size-4 text-[#d96749]" />
                      查询区间
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#5c6d71]">
                      {queryRange.startDate} 至 {queryRange.endDate}
                    </p>
                  </article>

                  <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1d2529]">
                      <RefreshCcw className="size-4 text-[#c57700]" />
                      最近同步
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#5c6d71]">
                      {new Date(activeData.connection.lastSyncedAt).toLocaleString("zh-CN")}
                    </p>
                  </article>

                  <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1d2529]">
                      <Clock3 className="size-4 text-[#d96749]" />
                      月卡有效期
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#5c6d71]">
                      {activeData.billing.accessUntil
                        ? formatTimestampLabel(activeData.billing.accessUntil)
                        : activeData.billing.message || "暂未获取"}
                    </p>
                  </article>

                  <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1d2529]">
                      <Sparkles className="size-4 text-[#0f766e]" />
                      额外提示
                    </div>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-[#5c6d71]">
                      <li>余额表会保留各站点最近一次同步结果，方便横向对比。</li>
                      <li>点击余额表任意行即可切换详细图表，不需要重新填写连接。</li>
                      <li>如果某个站点失败，优先检查地址、session 是否过期，或 New-Api-User 是否正确。</li>
                    </ul>
                  </article>
                </div>
              ) : (
                <div className="mt-6 flex min-h-[360px] items-center justify-center rounded-[1.75rem] bg-[#fbfaf5] text-center text-sm text-[#5c6d71]">
                  当前还没有活动站点详情，先保存并同步一个站点。
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
