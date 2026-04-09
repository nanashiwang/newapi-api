export type AuthType = "authorization" | "session" | "new-api-user";

export interface SiteConfig {
  id: string;
  name: string;
  baseUrl: string;
  authType: AuthType;
  authValue: string;
  userId: string | null;
  group: string;
  warningQuota: number | null;
}

export interface DashboardRange {
  startDate: string;
  endDate: string;
}

export interface DashboardSettings {
  sites: SiteConfig[];
  crsSites: CrsSiteConfig[];
  range: DashboardRange;
  activeSiteId: string | null;
  activeCrsSiteId: string | null;
}

// ---------------------------------------------------------------------------
// CRS (Claude Reverse Service) 站点相关类型
// ---------------------------------------------------------------------------

export interface CrsSiteConfig {
  id: string;
  name: string;
  baseUrl: string;
  username: string;
  password: string;
  group: string;
}

export interface CrsPlatformAccount {
  total: number;
  normal: number;
  abnormal: number;
  paused: number;
  rateLimited: number;
}

export interface CrsDashboardData {
  overview: {
    totalApiKeys: number;
    activeApiKeys: number;
    totalAccounts: number;
    normalAccounts: number;
    abnormalAccounts: number;
    pausedAccounts: number;
    rateLimitedAccounts: number;
    accountsByPlatform: Record<string, CrsPlatformAccount>;
    totalTokensUsed: number;
    totalRequestsUsed: number;
    totalInputTokensUsed: number;
    totalOutputTokensUsed: number;
    totalCacheCreateTokensUsed: number;
    totalCacheReadTokensUsed: number;
  };
  recentActivity: {
    requestsToday: number;
    tokensToday: number;
    inputTokensToday: number;
    outputTokensToday: number;
  };
  realtimeMetrics: {
    rpm: number;
    tpm: number;
    windowMinutes: number;
  };
  systemHealth: {
    redisConnected: boolean;
    uptime: number;
  };
}

export interface CrsSiteSummaryRow {
  id: string;
  name: string;
  group: string;
  host: string;
  status: "idle" | "loading" | "ready" | "error";
  totalAccounts: number | null;
  normalAccounts: number | null;
  abnormalAccounts: number | null;
  totalApiKeys: number | null;
  activeApiKeys: number | null;
  platforms: Record<string, CrsPlatformAccount> | null;
  rpm: number | null;
  tpm: number | null;
  lastSyncedAt: string | null;
  message: string | null;
}

export interface DashboardRequest {
  baseUrl: string;
  authType: AuthType;
  authValue: string;
  userId: string | null;
  startTimestamp: number;
  endTimestamp: number;
}

export interface TrendPoint {
  timestamp: number;
  label: string;
  quota: number;
  tokenUsed: number;
  requests: number;
}

export interface ModelBreakdownItem {
  name: string;
  quota: number;
  tokenUsed: number;
  requests: number;
  share: number;
  lastSeen: number;
}

export interface UserSnapshot {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  group: string | null;
  role: number;
  roleLabel: string;
  status: number;
  statusLabel: string;
  quota: number;
  usedQuota: number;
  requestCount: number;
}

export interface DashboardData {
  connection: {
    host: string;
    baseUrl: string;
    authType: AuthType;
    authTypeLabel: string;
    lastSyncedAt: string;
    startTimestamp: number;
    endTimestamp: number;
    spanDays: number;
  };
  user: UserSnapshot;
  overview: {
    currentBalance: number;
    historicalUsage: number;
    totalRequests: number;
    periodQuota: number;
    periodTokens: number;
    periodRequests: number;
    activeModels: number;
    averageQuotaPerRequest: number;
    burnPerDay: number;
    estimatedRunwayDays: number | null;
    usageRate: number | null;
    peakLabel: string | null;
  };
  billing: {
    supported: boolean;
    message: string | null;
    hardLimitUsd: number | null;
    softLimitUsd: number | null;
    systemHardLimitUsd: number | null;
    usageUsd: number | null;
    remainingUsd: number | null;
    accessUntil: number | null;
  };
  trend: {
    hourly: TrendPoint[];
    daily: TrendPoint[];
  };
  models: ModelBreakdownItem[];
}

export interface QuotaRecord {
  modelName: string;
  createdAt: number;
  quota: number;
  tokenUsed: number;
  count: number;
}

export interface SiteSummaryRow {
  id: string;
  name: string;
  group: string;
  host: string;
  baseUrl: string;
  authTypeLabel: string;
  status: "idle" | "loading" | "ready" | "error";
  warningQuota: number | null;
  currentBalance: number | null;
  historicalUsage: number | null;
  periodQuota: number | null;
  totalRequests: number | null;
  activeModels: number | null;
  lastSyncedAt: string | null;
  message: string | null;
}
