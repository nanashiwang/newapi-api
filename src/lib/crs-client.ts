import type { CrsDashboardData, CrsPlatformAccount } from "@/lib/dashboard-types";

// ---------------------------------------------------------------------------
// CRS 接口封装
// ---------------------------------------------------------------------------

type LoginPayload = {
  success?: boolean;
  token?: string;
  expiresIn?: number;
  username?: string;
};

type DashboardPayload = {
  success?: boolean;
  data?: {
    overview?: Record<string, unknown>;
    recentActivity?: Record<string, unknown>;
    realtimeMetrics?: Record<string, unknown>;
    systemHealth?: Record<string, unknown>;
  };
};

function normalizeBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("请填写 CRS 站点地址。");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    throw new Error("CRS 站点地址格式无效，请输入完整域名或带协议的 URL。");
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizePlatformAccount(raw: unknown): CrsPlatformAccount {
  if (typeof raw !== "object" || raw === null) {
    return { total: 0, normal: 0, abnormal: 0, paused: 0, rateLimited: 0 };
  }

  const record = raw as Record<string, unknown>;
  return {
    total: toNumber(record.total),
    normal: toNumber(record.normal),
    abnormal: toNumber(record.abnormal),
    paused: toNumber(record.paused),
    rateLimited: toNumber(record.rateLimited),
  };
}

function normalizePlatformMap(
  raw: unknown,
): Record<string, CrsPlatformAccount> {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const result: Record<string, CrsPlatformAccount> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key] = normalizePlatformAccount(value);
  }

  return result;
}

// ---------------------------------------------------------------------------
// 登录
// ---------------------------------------------------------------------------

export async function crsLogin(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const normalizedUrl = normalizeBaseUrl(baseUrl);
  const response = await fetch(`${normalizedUrl}/web/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });

  const payload = (await response.json()) as LoginPayload;

  if (!response.ok || !payload.success) {
    throw new Error("CRS 登录失败，请检查用户名或密码。");
  }

  if (!payload.token) {
    throw new Error("CRS 登录成功但未返回 token。");
  }

  return payload.token;
}

// ---------------------------------------------------------------------------
// 拉取 Dashboard
// ---------------------------------------------------------------------------

export async function crsFetchDashboard(
  baseUrl: string,
  token: string,
): Promise<CrsDashboardData> {
  const normalizedUrl = normalizeBaseUrl(baseUrl);
  const response = await fetch(`${normalizedUrl}/admin/dashboard`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as DashboardPayload;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error("CRS Dashboard 数据拉取失败。");
  }

  const { data } = payload;
  const overview = (data.overview ?? {}) as Record<string, unknown>;
  const recent = (data.recentActivity ?? {}) as Record<string, unknown>;
  const metrics = (data.realtimeMetrics ?? {}) as Record<string, unknown>;
  const health = (data.systemHealth ?? {}) as Record<string, unknown>;

  return {
    overview: {
      totalApiKeys: toNumber(overview.totalApiKeys),
      activeApiKeys: toNumber(overview.activeApiKeys),
      totalAccounts: toNumber(overview.totalAccounts),
      normalAccounts: toNumber(overview.normalAccounts),
      abnormalAccounts: toNumber(overview.abnormalAccounts),
      pausedAccounts: toNumber(overview.pausedAccounts),
      rateLimitedAccounts: toNumber(overview.rateLimitedAccounts),
      accountsByPlatform: normalizePlatformMap(overview.accountsByPlatform),
      totalTokensUsed: toNumber(overview.totalTokensUsed),
      totalRequestsUsed: toNumber(overview.totalRequestsUsed),
      totalInputTokensUsed: toNumber(overview.totalInputTokensUsed),
      totalOutputTokensUsed: toNumber(overview.totalOutputTokensUsed),
      totalCacheCreateTokensUsed: toNumber(overview.totalCacheCreateTokensUsed),
      totalCacheReadTokensUsed: toNumber(overview.totalCacheReadTokensUsed),
    },
    recentActivity: {
      requestsToday: toNumber(recent.requestsToday),
      tokensToday: toNumber(recent.tokensToday),
      inputTokensToday: toNumber(recent.inputTokensToday),
      outputTokensToday: toNumber(recent.outputTokensToday),
    },
    realtimeMetrics: {
      rpm: toNumber(metrics.rpm),
      tpm: toNumber(metrics.tpm),
      windowMinutes: toNumber(metrics.windowMinutes),
    },
    systemHealth: {
      redisConnected: toBoolean(health.redisConnected),
      uptime: toNumber(health.uptime),
    },
  };
}

// ---------------------------------------------------------------------------
// 组合：登录 + 拉数据
// ---------------------------------------------------------------------------

export async function loadCrsDashboardData(config: {
  baseUrl: string;
  username: string;
  password: string;
}): Promise<CrsDashboardData> {
  if (!config.username.trim()) {
    throw new Error("请填写 CRS 用户名。");
  }

  if (!config.password.trim()) {
    throw new Error("请填写 CRS 密码。");
  }

  const token = await crsLogin(config.baseUrl, config.username, config.password);
  return crsFetchDashboard(config.baseUrl, token);
}
