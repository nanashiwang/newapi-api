"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

export type DashboardSection = "sites" | "board" | "insights";

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

const SECTION_META: Record<
  DashboardSection,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  sites: {
    eyebrow: "Site Manager",
    title: "把站点配置和查询参数收拢到独立页面。",
    description:
      "这个页面只负责站点新增、编辑、删除与查询区间配置，不再和图表、余额表混在一起。",
  },
  board: {
    eyebrow: "Balance Board",
    title: "专门看多站点余额表和横向对比。",
    description:
      "这里集中展示所有站点的余额、用量和同步状态，适合做批量巡检、筛选和导出。",
  },
  insights: {
    eyebrow: "Active Site",
    title: "专门看当前站点的画像、趋势和月卡信息。",
    description:
      "把图表、账户信号、模型消耗和连接摘要拆到独立页面，避免在一个长页里来回找内容。",
  },
};

const SECTION_PATH_MAP: Record<DashboardSection, string> = {
  sites: "/sites",
  board: "/board",
  insights: "/insights",
};

const SECTION_NAV_ITEMS = [
  {
    section: "sites" as const,
    label: "站点管理",
    icon: ShieldCheck,
  },
  {
    section: "board" as const,
    label: "余额看板",
    icon: Rows3,
  },
  {
    section: "insights" as const,
    label: "站点洞察",
    icon: Activity,
  },
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

export function DashboardShell({
  section = "sites",
}: DashboardShellProps) {
  const router = useRouter();
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

    window.localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, siteId);
    setActiveSiteId(siteId);
    setSiteDraft(siteToDraft(site));
  }

  function removeSiteById(removingId: string) {
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

  function handleEditSite(siteId: string) {
    handleSelectSite(siteId);
    setErrorMessage(null);

    if (section !== "sites") {
      router.push(SECTION_PATH_MAP.sites);
    }
  }

  function handleDeleteSite(siteId: string) {
    const site = sites.find((item) => item.id === siteId);
    if (!site) {
      return;
    }

    const shouldDelete = window.confirm(
      `确认删除站点“${site.name}”吗？这只会删除当前浏览器里的本地配置。`,
    );

    if (!shouldDelete) {
      return;
    }

    removeSiteById(siteId);
    setErrorMessage(null);
  }

  function handleDeleteDraftSite() {
    if (!siteDraft.id) {
      setSiteDraft(createEmptySiteDraft());
      return;
    }

    handleDeleteSite(siteDraft.id);
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

  function jumpToSection(nextSection: DashboardSection, siteId?: string) {
    if (siteId) {
      handleSelectSite(siteId);
    }

    if (section !== nextSection) {
      router.push(SECTION_PATH_MAP[nextSection]);
    }
  }

  const sectionMeta = SECTION_META[section];
  const hasSites = sites.length > 0;
  const readySiteCount = orderedRows.filter((row) => row.status === "ready").length;
  const errorSiteCount = orderedRows.filter((row) => row.status === "error").length;
  const lowBalanceCount = orderedRows.filter(
    (row) =>
      row.warningQuota !== null &&
      row.warningQuota > 0 &&
      row.currentBalance !== null &&
      row.currentBalance <= row.warningQuota,
  ).length;
  const syncedBalanceTotal = orderedRows.reduce(
    (total, row) => total + (row.currentBalance ?? 0),
    0,
  );
  const syncedQuotaTotal = orderedRows.reduce(
    (total, row) => total + (row.periodQuota ?? 0),
    0,
  );
  const hasSyncedBalance = orderedRows.some((row) => row.currentBalance !== null);
  const hasSyncedQuota = orderedRows.some((row) => row.periodQuota !== null);
  const activeSiteHost = activeSite ? parseHost(activeSite.baseUrl) : "未选择站点";
  const activeSiteLastSynced = activeData
    ? new Date(activeData.connection.lastSyncedAt).toLocaleString("zh-CN")
    : "等待同步";
  const queryRangeLabel = `${queryRange.startDate} 至 ${queryRange.endDate}`;

  return (
    <main className="shell-container">
      <section className="surface-card relative overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(217,103,73,0.2),transparent_48%),radial-gradient(circle_at_top_right,rgba(15,118,110,0.18),transparent_40%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="accent-pill">
                <Sparkles className="size-3.5" />
                {sectionMeta.eyebrow}
              </span>
              <span className="rounded-full border border-black/5 bg-white/75 px-3 py-1 text-xs font-semibold text-[#5c6d71]">
                {hasSites ? `${sites.length} 个站点已保存` : "尚未保存站点"}
              </span>
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-[#1d2529] sm:text-5xl">
              {sectionMeta.title}
            </h1>
            <p className="muted-copy mt-4 max-w-2xl text-base sm:text-lg">
              {sectionMeta.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {SECTION_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isCurrent = item.section === section;

                return (
                  <Link
                    key={item.section}
                    href={SECTION_PATH_MAP[item.section]}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition ${
                      isCurrent
                        ? "bg-[#1d2529] text-white shadow-[0_18px_40px_-24px_rgba(29,37,41,0.7)]"
                        : "border border-black/5 bg-white/75 text-[#1d2529] hover:bg-white"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {section === "sites" ? (
              <>
                <article className="rounded-[1.75rem] border border-white/70 bg-emerald-50 p-5">
                  <p className="stat-note">Local Vault</p>
                  <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                    已保存 {formatNumber(sites.length)} 个站点
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#5c6d71]">
                    浏览器本地保存地址、鉴权方式和用户 ID，切换设备时需要重新导入。
                  </p>
                </article>

                <article className="rounded-[1.75rem] border border-white/70 bg-amber-50 p-5">
                  <p className="stat-note">Range Guardrail</p>
                  <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                    {queryRangeLabel}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#5c6d71]">
                    当前所有站点共用这段查询区间，单次刷新依然保持最多 30 天。
                  </p>
                </article>
              </>
            ) : null}

            {section === "board" ? (
              <>
                <article className="rounded-[1.75rem] border border-white/70 bg-emerald-50 p-5">
                  <p className="stat-note">Synced Sites</p>
                  <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                    {formatNumber(readySiteCount)} 个站点已同步
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#5c6d71]">
                    {errorSiteCount > 0
                      ? `另有 ${formatNumber(errorSiteCount)} 个站点同步失败，需要检查鉴权或地址。`
                      : "所有已同步站点都会参与余额总览和横向对比。"}
                  </p>
                </article>

                <article className="rounded-[1.75rem] border border-white/70 bg-amber-50 p-5">
                  <p className="stat-note">Cross Site Balance</p>
                  <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                    {hasSyncedBalance ? formatNumber(syncedBalanceTotal) : "--"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#5c6d71]">
                    {lowBalanceCount > 0
                      ? `当前有 ${formatNumber(lowBalanceCount)} 个站点命中低余额预警。`
                      : "余额总和按已成功同步的站点实时汇总。"}
                  </p>
                </article>
              </>
            ) : null}

            {section === "insights" ? (
              <>
                <article className="rounded-[1.75rem] border border-white/70 bg-emerald-50 p-5">
                  <p className="stat-note">Active Site</p>
                  <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                    {activeSite?.name || "未选择站点"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#5c6d71]">{activeSiteHost}</p>
                </article>

                <article className="rounded-[1.75rem] border border-white/70 bg-amber-50 p-5">
                  <p className="stat-note">Last Sync</p>
                  <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                    {activeSiteLastSynced}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#5c6d71]">
                    站点洞察会复用当前活动站点最近一次同步得到的数据和月卡信息。
                  </p>
                </article>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="mt-6 rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div
        className={`mt-6 grid gap-6 ${
          section === "sites" ? "xl:grid-cols-[400px_minmax(0,1fr)]" : ""
        }`}
      >
        {section === "sites" ? (
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

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
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
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
                            <span className="rounded-full bg-slate-100 px-3 py-1">
                              {site.group || "未分组"}
                            </span>
                            {site.warningQuota !== null ? (
                              <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                                阈值 {formatNumber(site.warningQuota)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="rounded-full bg-slate-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-600">
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
        ) : null}

        <div className="grid gap-6">
          {section === "sites" ? (
            <>
              <section className="surface-card p-6">
                <div className="flex flex-col gap-4 border-b border-black/5 pb-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="stat-note">Active Site Snapshot</p>
                    <h2 className="section-title mt-2">
                      {activeSite?.name || "尚未选择活动站点"}
                    </h2>
                    <p className="muted-copy mt-2">
                      站点管理页只负责配置本身。余额对比和详细洞察已经拆到独立页面。
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => jumpToSection("board")}
                      disabled={!hasSites}
                    >
                      <Rows3 className="size-4" />
                      打开余额看板
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => activeSite && jumpToSection("insights", activeSite.id)}
                      disabled={!activeSite}
                    >
                      <Activity className="size-4" />
                      查看站点洞察
                    </button>
                  </div>
                </div>

                {activeSite ? (
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-5">
                      <p className="field-label">连接信息</p>
                      <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                        {parseHost(activeSite.baseUrl)}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#5c6d71]">
                        <span className="rounded-full bg-white px-3 py-1">
                          鉴权：{getAuthTypeLabel(activeSite.authType)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1">
                          分组：{activeSite.group || "未分组"}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1">
                          阈值：
                          {activeSite.warningQuota === null
                            ? "未设置"
                            : formatNumber(activeSite.warningQuota)}
                        </span>
                      </div>
                      <p className="mt-4 break-all text-sm leading-6 text-[#5c6d71]">
                        {activeSite.baseUrl}
                      </p>
                    </article>

                    <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-5">
                      <p className="field-label">最近同步快照</p>
                      <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                        {activeData ? formatNumber(activeData.overview.currentBalance) : "等待同步"}
                      </p>
                      <p className="mt-2 text-sm text-[#5c6d71]">
                        {activeData
                          ? `当前余额，最近同步时间为 ${activeSiteLastSynced}。`
                          : "保存后会自动请求接口并回填当前余额、请求数和模型拆解。"}
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a898d]">
                            历史已用
                          </p>
                          <p className="mt-2 text-base font-semibold text-[#1d2529]">
                            {formatNumber(activeData?.overview.historicalUsage ?? 0)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a898d]">
                            月卡剩余
                          </p>
                          <p className="mt-2 text-base font-semibold text-[#1d2529]">
                            {formatUsd(activeData?.billing.remainingUsd ?? null)}
                          </p>
                        </div>
                      </div>
                    </article>
                  </div>
                ) : (
                  <div className="mt-6 flex min-h-[240px] items-center justify-center rounded-[1.75rem] bg-[#fbfaf5] text-center text-sm text-[#5c6d71]">
                    先保存一个站点，右侧就会展示活动站点快照，并且可以跳到余额看板或站点洞察。
                  </div>
                )}
              </section>

              <section className="surface-card p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="stat-note">Page Split</p>
                    <h2 className="section-title mt-2">新的页面分工</h2>
                    <p className="muted-copy mt-2">
                      以后都基于这套新布局渲染，不再回到旧的单页堆叠模式。
                    </p>
                  </div>
                  <Rows3 className="size-5 text-[#0f766e]" />
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-3">
                  {SECTION_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isCurrent = item.section === section;
                    const meta = SECTION_META[item.section];

                    return (
                      <Link
                        key={item.section}
                        href={SECTION_PATH_MAP[item.section]}
                        className={`rounded-[1.5rem] border p-5 transition ${
                          isCurrent
                            ? "border-[#0f766e]/20 bg-emerald-50"
                            : "border-black/5 bg-[#fbfaf5] hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex size-11 items-center justify-center rounded-2xl bg-white text-[#1d2529]">
                            <Icon className="size-5" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#1d2529]">{item.label}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#7a898d]">
                              {meta.eyebrow}
                            </p>
                          </div>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-[#5c6d71]">{meta.description}</p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}

          {section === "board" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  icon={ShieldCheck}
                  tone="teal"
                  label="已保存站点"
                  value={formatNumber(sites.length)}
                  detail="本地已保存的 NewAPI 实例数量"
                />
                <MetricCard
                  icon={RefreshCcw}
                  tone="amber"
                  label="已同步站点"
                  value={formatNumber(readySiteCount)}
                  detail={
                    errorSiteCount > 0
                      ? `另有 ${formatNumber(errorSiteCount)} 个站点同步失败`
                      : "同步成功的站点会参与总览汇总"
                  }
                />
                <MetricCard
                  icon={Wallet}
                  tone="slate"
                  label="总余额"
                  value={hasSyncedBalance ? formatNumber(syncedBalanceTotal) : "--"}
                  detail="按已成功同步站点的当前余额求和"
                />
                <MetricCard
                  icon={ScanLine}
                  tone="coral"
                  label="区间总消耗"
                  value={hasSyncedQuota ? formatNumber(syncedQuotaTotal) : "--"}
                  detail={
                    lowBalanceCount > 0
                      ? `${formatNumber(lowBalanceCount)} 个站点触发低余额预警`
                      : "当前筛选站点没有低余额预警"
                  }
                />
              </div>

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
                    void refreshSingleSite(site, { activate: site.id === activeSiteId });
                  }
                }}
                onRefreshAll={() => {
                  void refreshAllSites();
                }}
              />

              <section className="surface-card p-6">
                <div className="flex flex-col gap-4 border-b border-black/5 pb-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="stat-note">Selected Site</p>
                    <h2 className="section-title mt-2">
                      {activeSite?.name || "还没有选中站点"}
                    </h2>
                    <p className="muted-copy mt-2">
                      在余额表中点击“查看详情”会直接跳到站点洞察页，点击“编辑”则回到站点管理页。
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => activeSite && jumpToSection("sites", activeSite.id)}
                      disabled={!activeSite}
                    >
                      <ShieldCheck className="size-4" />
                      编辑当前站点
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => activeSite && jumpToSection("insights", activeSite.id)}
                      disabled={!activeSite}
                    >
                      <Activity className="size-4" />
                      打开站点洞察
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-5">
                    <p className="field-label">当前活动站点</p>
                    <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                      {activeSite?.name || "未选择站点"}
                    </p>
                    <p className="mt-2 text-sm text-[#5c6d71]">{activeSiteHost}</p>
                  </article>

                  <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-5">
                    <p className="field-label">查询区间</p>
                    <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                      {queryRangeLabel}
                    </p>
                    <p className="mt-2 text-sm text-[#5c6d71]">
                      所有站点共享同一段统计区间，便于统一比较。
                    </p>
                  </article>

                  <article className="rounded-[1.5rem] border border-black/5 bg-[#fbfaf5] p-5">
                    <p className="field-label">异常站点</p>
                    <p className="mt-3 text-lg font-semibold text-[#1d2529]">
                      {formatNumber(errorSiteCount)}
                    </p>
                    <p className="mt-2 text-sm text-[#5c6d71]">
                      同步失败时优先检查地址、session、Authorization 或 New-Api-User。
                    </p>
                  </article>
                </div>
              </section>
            </>
          ) : null}

          {section === "insights" ? (
            <>
              <section className="surface-card p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="stat-note">Active Site</p>
                    <h2 className="section-title mt-2">
                      {activeSite?.name || "未选择站点"}
                    </h2>
                    <p className="muted-copy mt-2">
                      {activeSite
                        ? `当前正在查看 ${parseHost(activeSite.baseUrl)} 的详细额度画像、趋势和模型消耗。`
                        : "先从站点管理页保存一个站点，或在余额看板里选择一个站点。"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {activeSite ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                        <Rows3 className="size-4" />
                        {getAuthTypeLabel(activeSite.authType)}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => activeSite && jumpToSection("board", activeSite.id)}
                      disabled={!activeSite}
                    >
                      <Rows3 className="size-4" />
                      返回余额看板
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => activeSite && jumpToSection("sites", activeSite.id)}
                      disabled={!activeSite}
                    >
                      <ShieldCheck className="size-4" />
                      编辑站点配置
                    </button>
                    <button
                      type="button"
                      className="primary-button"
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
                      刷新当前站点
                    </button>
                  </div>
                </div>
              </section>

              <section className="surface-card p-6">
                <div className="flex flex-col gap-4 border-b border-black/5 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="stat-note">Quota Overview</p>
                    <h2 className="section-title mt-2">额度概览</h2>
                    <p className="muted-copy mt-2">
                      当前查询区间为 {queryRangeLabel}，基础额度和月卡数据会一起展示。
                    </p>
                  </div>
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
                  <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-[#1d2529]">
                          {activeData.user.displayName || activeData.user.username}
                        </p>
                        <p className="mt-1 text-sm text-[#5c6d71]">
                          {activeData.user.email || "未公开邮箱"}
                        </p>
                      </div>
                      <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
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

                  <div className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
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
                <div className="mt-6 flex min-h-[540px] items-center justify-center rounded-[1.75rem] bg-slate-50 text-center text-sm text-slate-600">
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
                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1d2529]">
                      <Server className="size-4 text-[#0f766e]" />
                      目标主机
                    </div>
                    <p className="mt-3 break-all text-sm leading-6 text-[#5c6d71]">
                      {activeData.connection.baseUrl}
                    </p>
                  </article>

                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1d2529]">
                      <CalendarRange className="size-4 text-[#d96749]" />
                      查询区间
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#5c6d71]">
                      {queryRange.startDate} 至 {queryRange.endDate}
                    </p>
                  </article>

                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1d2529]">
                      <RefreshCcw className="size-4 text-[#c57700]" />
                      最近同步
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#5c6d71]">
                      {new Date(activeData.connection.lastSyncedAt).toLocaleString("zh-CN")}
                    </p>
                  </article>

                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
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

                  <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#1d2529]">
                      <Sparkles className="size-4 text-[#0f766e]" />
                      额外提示
                    </div>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-[#5c6d71]">
                        <li>余额表会保留各站点最近一次同步结果，方便横向对比。</li>
                        <li>在余额看板里点击“查看详情”会直接切到这个洞察页面。</li>
                        <li>如果某个站点失败，优先检查地址、session 是否过期，或 New-Api-User 是否正确。</li>
                      </ul>
                  </article>
                </div>
              ) : (
                <div className="mt-6 flex min-h-[360px] items-center justify-center rounded-[1.75rem] bg-[#fbfaf5] text-center text-sm text-[#5c6d71]">
                  当前还没有活动站点详情，先刷新一次站点数据。
                </div>
              )}
            </section>
          </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
