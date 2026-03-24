import type {
  AuthType,
  DashboardData,
  DashboardRequest,
  ModelBreakdownItem,
  QuotaRecord,
  TrendPoint,
  UserSnapshot,
} from "@/lib/dashboard-types";

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type BillingSubscriptionPayload = {
  object?: string;
  has_payment_method?: boolean;
  soft_limit_usd?: number | null;
  hard_limit_usd?: number | null;
  system_hard_limit_usd?: number | null;
  access_until?: number | null;
};

type BillingUsagePayload = {
  object?: string;
  total_usage?: number | null;
};

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  authorization: "Authorization",
  session: "session",
  "new-api-user": "New-Api-User",
};

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

function toText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function getRoleLabel(role: number): string {
  if (role === 100) {
    return "Root";
  }

  if (role === 10) {
    return "Admin";
  }

  if (role === 1) {
    return "User";
  }

  return "未知角色";
}

function getStatusLabel(status: number): string {
  if (status === 1) {
    return "正常";
  }

  if (status === 2) {
    return "禁用";
  }

  return "未知状态";
}

function normalizeBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("请填写 NewAPI 地址。");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    throw new Error("NewAPI 地址格式无效，请输入完整域名或带协议的 URL。");
  }
}

function normalizeUserId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function createAuthHeaders(
  authType: AuthType,
  rawAuthValue: string,
  userIdOverride: string | null = null,
  mode: "plain" | "bearer" = "plain",
): Record<string, string> {
  const authValue = rawAuthValue.trim();
  if (!authValue) {
    throw new Error("请填写鉴权值。");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (authType === "authorization") {
    headers.Authorization = authValue;
  }

  if (authType === "session") {
    headers.Cookie = authValue.startsWith("session=")
      ? authValue
      : `session=${authValue}`;
  }

  if (authType === "new-api-user") {
    headers["New-Api-User"] = authValue;
  }

  if (authType !== "new-api-user" && userIdOverride) {
    headers["New-Api-User"] =
      mode === "bearer" ? `Bearer ${userIdOverride}` : userIdOverride;
  }

  return headers;
}

function createStatisticsHeaders(
  authType: AuthType,
  authValue: string,
  user: UserSnapshot,
  userIdOverride: string | null = null,
  mode: "plain" | "bearer" = "plain",
): Record<string, string> {
  const resolvedUserId = userIdOverride ?? String(user.id);
  const headers = createAuthHeaders(authType, authValue, resolvedUserId, mode);

  if (authType === "new-api-user") {
    return headers;
  }

  if (!resolvedUserId) {
    throw new Error("当前账号未返回有效用户 ID，无法补充 New-Api-User 请求头。");
  }

  return headers;
}

function shouldRetryWithLegacyUserHeader(error: unknown): boolean {
  return error instanceof Error && /New-Api-User/i.test(error.message);
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function fetchPlainJson<T>(url: string, headers: HeadersInit): Promise<T> {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as unknown)
    : await response.text();

  if (!response.ok) {
    if (
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
    ) {
      throw new Error(payload.error.message);
    }

    if (
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
    ) {
      throw new Error(payload.message);
    }

    throw new Error(`上游计费接口请求失败，状态码 ${response.status}。`);
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("上游计费接口未返回 JSON 数据。");
  }

  return payload as T;
}

async function fetchBillingPayload<T>(
  baseUrl: string,
  path: string,
  headers: HeadersInit,
): Promise<T> {
  const candidates = [`${baseUrl}${path}`, `${baseUrl}/v1${path}`];
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return await fetchPlainJson<T>(candidate, headers);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("计费接口请求失败。");
}

async function fetchEnvelope<T>(url: string, headers: HeadersInit): Promise<T> {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as unknown)
    : await response.text();

  if (!response.ok) {
    if (
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
    ) {
      throw new Error(payload.message);
    }

    throw new Error(`上游接口请求失败，状态码 ${response.status}。`);
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("上游接口未返回 JSON 数据。");
  }

  const envelope = payload as ApiEnvelope<T>;
  if (envelope.success !== true) {
    throw new Error(envelope.message?.trim() || "上游接口返回失败。");
  }

  if (envelope.data === undefined) {
    throw new Error("上游接口缺少 data 字段。");
  }

  return envelope.data;
}

function normalizeUser(payload: unknown): UserSnapshot {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("用户信息返回格式无效。");
  }

  const user = payload as Record<string, unknown>;
  const role = toNumber(user.role);
  const status = toNumber(user.status);

  return {
    id: toNumber(user.id),
    username: toText(user.username) ?? "未命名用户",
    displayName: toText(user.display_name),
    email: toText(user.email),
    group: toText(user.group),
    role,
    roleLabel: getRoleLabel(role),
    status,
    statusLabel: getStatusLabel(status),
    quota: toNumber(user.quota),
    usedQuota: toNumber(user.used_quota),
    requestCount: toNumber(user.request_count),
  };
}

function normalizeQuotaRecords(payload: unknown): QuotaRecord[] {
  if (!Array.isArray(payload)) {
    throw new Error("额度明细返回格式无效。");
  }

  return payload
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const createdAt = toNumber(record.created_at);

      if (!createdAt) {
        return null;
      }

      return {
        modelName: toText(record.model_name) ?? "未命名模型",
        createdAt,
        quota: toNumber(record.quota),
        tokenUsed: toNumber(record.token_used),
        count: toNumber(record.count),
      };
    })
    .filter((item): item is QuotaRecord => item !== null)
    .sort((left, right) => left.createdAt - right.createdAt);
}

function getBucketStart(timestamp: number, granularity: "hourly" | "daily"): number {
  const date = new Date(timestamp * 1000);

  if (granularity === "daily") {
    return Math.floor(
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() /
        1000,
    );
  }

  return Math.floor(
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
    ).getTime() / 1000,
  );
}

function buildTrend(
  records: QuotaRecord[],
  granularity: "hourly" | "daily",
): TrendPoint[] {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    ...(granularity === "hourly" ? { hour: "2-digit" } : {}),
  });

  const buckets = new Map<number, TrendPoint>();

  for (const record of records) {
    const bucketStart = getBucketStart(record.createdAt, granularity);
    const existing = buckets.get(bucketStart) ?? {
      timestamp: bucketStart,
      label: formatter.format(new Date(bucketStart * 1000)),
      quota: 0,
      tokenUsed: 0,
      requests: 0,
    };

    existing.quota += record.quota;
    existing.tokenUsed += record.tokenUsed;
    existing.requests += record.count;

    buckets.set(bucketStart, existing);
  }

  return [...buckets.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function buildModelBreakdown(records: QuotaRecord[]): ModelBreakdownItem[] {
  const byModel = new Map<string, ModelBreakdownItem>();
  const totalQuota = records.reduce((sum, record) => sum + record.quota, 0);

  for (const record of records) {
    const existing = byModel.get(record.modelName) ?? {
      name: record.modelName,
      quota: 0,
      tokenUsed: 0,
      requests: 0,
      share: 0,
      lastSeen: 0,
    };

    existing.quota += record.quota;
    existing.tokenUsed += record.tokenUsed;
    existing.requests += record.count;
    existing.lastSeen = Math.max(existing.lastSeen, record.createdAt);

    byModel.set(record.modelName, existing);
  }

  return [...byModel.values()]
    .map((item) => ({
      ...item,
      share: totalQuota > 0 ? (item.quota / totalQuota) * 100 : 0,
    }))
    .sort((left, right) => right.quota - left.quota);
}

export async function loadDashboardData(
  payload: DashboardRequest,
): Promise<DashboardData> {
  if (!Number.isFinite(payload.startTimestamp) || !Number.isFinite(payload.endTimestamp)) {
    throw new Error("请选择有效的开始和结束日期。");
  }

  if (payload.endTimestamp < payload.startTimestamp) {
    throw new Error("结束时间不能早于开始时间。");
  }

  if (payload.endTimestamp - payload.startTimestamp > THIRTY_DAYS_IN_SECONDS) {
    throw new Error("NewAPI 的个人额度统计接口单次最多查询 30 天。");
  }

  const baseUrl = normalizeBaseUrl(payload.baseUrl);
  const userIdOverride = normalizeUserId(payload.userId);
  const headers = createAuthHeaders(
    payload.authType,
    payload.authValue,
    userIdOverride,
  );

  const params = new URLSearchParams({
    start_timestamp: String(Math.floor(payload.startTimestamp)),
    end_timestamp: String(Math.floor(payload.endTimestamp)),
  });

  let userPayload: unknown;

  try {
    userPayload = await fetchEnvelope<unknown>(`${baseUrl}/api/user/self`, headers);
  } catch (error) {
    if (payload.authType === "new-api-user") {
      throw error;
    }

    if (!shouldRetryWithLegacyUserHeader(error)) {
      throw error;
    }

    if (!userIdOverride) {
      throw new Error(
        "当前站点的 /api/user/self 也要求提供 New-Api-User，请在站点配置里填写用户 ID 后重试。",
      );
    }

    userPayload = await fetchEnvelope<unknown>(
      `${baseUrl}/api/user/self`,
      createAuthHeaders(
        payload.authType,
        payload.authValue,
        userIdOverride,
        "bearer",
      ),
    );
  }

  const user = normalizeUser(userPayload);
  const statisticsUrl = `${baseUrl}/api/data/self?${params.toString()}`;

  let quotaPayload: unknown;

  try {
    quotaPayload = await fetchEnvelope<unknown>(
      statisticsUrl,
      createStatisticsHeaders(
        payload.authType,
        payload.authValue,
        user,
        userIdOverride,
      ),
    );
  } catch (error) {
    if (
      payload.authType === "new-api-user" ||
      !shouldRetryWithLegacyUserHeader(error)
    ) {
      throw error;
    }

    quotaPayload = await fetchEnvelope<unknown>(
      statisticsUrl,
      createStatisticsHeaders(
        payload.authType,
        payload.authValue,
        user,
        userIdOverride,
        "bearer",
      ),
    );
  }

  const quotaRecords = normalizeQuotaRecords(quotaPayload);
  const hourly = buildTrend(quotaRecords, "hourly");
  const daily = buildTrend(quotaRecords, "daily");
  const models = buildModelBreakdown(quotaRecords);
  let billing: DashboardData["billing"] = {
    supported: false,
    message: null,
    hardLimitUsd: null,
    softLimitUsd: null,
    systemHardLimitUsd: null,
    usageUsd: null,
    remainingUsd: null,
    accessUntil: null,
  };

  if (payload.authType === "new-api-user") {
    billing.message = "当前鉴权方式无法读取订阅计费面板。";
  } else {
    const fetchBillingData = async (mode: "plain" | "bearer" = "plain") => {
      const billingHeaders = createStatisticsHeaders(
        payload.authType,
        payload.authValue,
        user,
        userIdOverride,
        mode,
      );

      return Promise.all([
        fetchBillingPayload<BillingSubscriptionPayload>(
          baseUrl,
          "/dashboard/billing/subscription",
          billingHeaders,
        ),
        fetchBillingPayload<BillingUsagePayload>(
          baseUrl,
          "/dashboard/billing/usage",
          billingHeaders,
        ),
      ]);
    };

    try {
      const [subscriptionPayload, usagePayload] = await fetchBillingData();
      const hardLimitUsd = toNullableNumber(subscriptionPayload.hard_limit_usd);
      const softLimitUsd = toNullableNumber(subscriptionPayload.soft_limit_usd);
      const systemHardLimitUsd = toNullableNumber(
        subscriptionPayload.system_hard_limit_usd,
      );
      const accessUntil = toNullableNumber(subscriptionPayload.access_until);
      const usageRaw = toNullableNumber(usagePayload.total_usage);
      const usageUsd = usageRaw === null ? null : usageRaw / 100;
      const limitUsd = hardLimitUsd ?? softLimitUsd ?? systemHardLimitUsd;

      billing = {
        supported: true,
        message: null,
        hardLimitUsd,
        softLimitUsd,
        systemHardLimitUsd,
        usageUsd,
        remainingUsd:
          limitUsd !== null && usageUsd !== null ? limitUsd - usageUsd : null,
        accessUntil,
      };
    } catch (error) {
      if (shouldRetryWithLegacyUserHeader(error)) {
        try {
          const [subscriptionPayload, usagePayload] = await fetchBillingData("bearer");
          const hardLimitUsd = toNullableNumber(subscriptionPayload.hard_limit_usd);
          const softLimitUsd = toNullableNumber(subscriptionPayload.soft_limit_usd);
          const systemHardLimitUsd = toNullableNumber(
            subscriptionPayload.system_hard_limit_usd,
          );
          const accessUntil = toNullableNumber(subscriptionPayload.access_until);
          const usageRaw = toNullableNumber(usagePayload.total_usage);
          const usageUsd = usageRaw === null ? null : usageRaw / 100;
          const limitUsd = hardLimitUsd ?? softLimitUsd ?? systemHardLimitUsd;

          billing = {
            supported: true,
            message: null,
            hardLimitUsd,
            softLimitUsd,
            systemHardLimitUsd,
            usageUsd,
            remainingUsd:
              limitUsd !== null && usageUsd !== null ? limitUsd - usageUsd : null,
            accessUntil,
          };
        } catch (retryError) {
          billing.message =
            retryError instanceof Error
              ? retryError.message
              : "当前站点未开放订阅计费接口。";
        }
      } else {
        billing.message =
          error instanceof Error ? error.message : "当前站点未开放订阅计费接口。";
      }
    }
  }

  const periodQuota = models.reduce((sum, item) => sum + item.quota, 0);
  const periodTokens = models.reduce((sum, item) => sum + item.tokenUsed, 0);
  const periodRequests = models.reduce((sum, item) => sum + item.requests, 0);
  const spanDays = Math.max(
    1,
    Math.ceil((payload.endTimestamp - payload.startTimestamp + 1) / 86400),
  );
  const peakPoint =
    [...hourly].sort((left, right) => right.quota - left.quota)[0] ?? null;
  const lifetimeTotal = user.quota + user.usedQuota;
  const burnPerDay = periodQuota / spanDays;

  return {
    connection: {
      host: new URL(baseUrl).host,
      baseUrl,
      authType: payload.authType,
      authTypeLabel: AUTH_TYPE_LABELS[payload.authType],
      lastSyncedAt: new Date().toISOString(),
      startTimestamp: payload.startTimestamp,
      endTimestamp: payload.endTimestamp,
      spanDays,
    },
    user,
    overview: {
      currentBalance: user.quota,
      historicalUsage: user.usedQuota,
      totalRequests: user.requestCount,
      periodQuota,
      periodTokens,
      periodRequests,
      activeModels: models.length,
      averageQuotaPerRequest: periodRequests > 0 ? periodQuota / periodRequests : 0,
      burnPerDay,
      estimatedRunwayDays: burnPerDay > 0 ? user.quota / burnPerDay : null,
      usageRate: lifetimeTotal > 0 ? (user.usedQuota / lifetimeTotal) * 100 : null,
      peakLabel: peakPoint?.label ?? null,
    },
    billing,
    trend: {
      hourly,
      daily,
    },
    models,
  };
}
