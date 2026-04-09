import type {
  AuthType,
  CrsSiteConfig,
  DashboardRange,
  DashboardSettings,
  SiteConfig,
} from "@/lib/dashboard-types";
import { formatDateInput, shiftDate } from "@/lib/formatters";

export const DEFAULT_DASHBOARD_RANGE_DAYS = 30;

type DashboardSettingsInput = {
  sites?: Partial<SiteConfig>[];
  crsSites?: Partial<CrsSiteConfig>[];
  range?: Partial<DashboardRange>;
  activeSiteId?: string | null;
  activeCrsSiteId?: string | null;
};

export function parseHost(baseUrl: string): string {
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

export function deriveSiteName(name: string, baseUrl: string): string {
  return name.trim() || parseHost(baseUrl);
}

export function createRangeByDays(days: number): DashboardRange {
  const today = new Date();

  return {
    startDate: formatDateInput(shiftDate(today, -(days - 1))),
    endDate: formatDateInput(today),
  };
}

export function createDefaultRange(): DashboardRange {
  return createRangeByDays(DEFAULT_DASHBOARD_RANGE_DAYS);
}

export function normalizeOptionalText(rawValue: unknown): string | null {
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeWarningQuotaValue(rawValue: unknown): number | null {
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

export function normalizeSiteConfig(site: Partial<SiteConfig>): SiteConfig | null {
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

export function normalizeDashboardRange(
  range: Partial<DashboardRange> | null | undefined,
): DashboardRange {
  const fallback = createDefaultRange();

  return {
    startDate:
      typeof range?.startDate === "string" && range.startDate.trim()
        ? range.startDate
        : fallback.startDate,
    endDate:
      typeof range?.endDate === "string" && range.endDate.trim()
        ? range.endDate
        : fallback.endDate,
  };
}

export function normalizeCrsSiteConfig(
  site: Partial<CrsSiteConfig>,
): CrsSiteConfig | null {
  if (!site.id || !site.baseUrl?.trim() || !site.username?.trim() || !site.password?.trim()) {
    return null;
  }

  return {
    id: site.id,
    name: deriveSiteName(site.name ?? "", site.baseUrl),
    baseUrl: site.baseUrl.trim(),
    username: site.username.trim(),
    password: site.password.trim(),
    group: typeof site.group === "string" ? site.group.trim() : "",
  };
}

export function normalizeDashboardSettings(
  rawSettings: DashboardSettingsInput | DashboardSettings | null | undefined,
): DashboardSettings {
  const sites = Array.isArray(rawSettings?.sites)
    ? rawSettings.sites.flatMap((site) => {
        const normalizedSite = normalizeSiteConfig(site);
        return normalizedSite ? [normalizedSite] : [];
      })
    : [];

  const crsSites = Array.isArray(rawSettings?.crsSites)
    ? rawSettings.crsSites.flatMap((site) => {
        const normalizedSite = normalizeCrsSiteConfig(site);
        return normalizedSite ? [normalizedSite] : [];
      })
    : [];

  const range = normalizeDashboardRange(rawSettings?.range);
  const requestedActiveSiteId =
    typeof rawSettings?.activeSiteId === "string" && rawSettings.activeSiteId.trim()
      ? rawSettings.activeSiteId
      : null;
  const activeSiteId =
    requestedActiveSiteId && sites.some((site) => site.id === requestedActiveSiteId)
      ? requestedActiveSiteId
      : sites[0]?.id ?? null;

  const requestedActiveCrsSiteId =
    typeof rawSettings?.activeCrsSiteId === "string" && rawSettings.activeCrsSiteId.trim()
      ? rawSettings.activeCrsSiteId
      : null;
  const activeCrsSiteId =
    requestedActiveCrsSiteId && crsSites.some((site) => site.id === requestedActiveCrsSiteId)
      ? requestedActiveCrsSiteId
      : crsSites[0]?.id ?? null;

  return {
    sites,
    crsSites,
    range,
    activeSiteId,
    activeCrsSiteId,
  };
}
