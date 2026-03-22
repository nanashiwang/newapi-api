export type AuthType = "authorization" | "session" | "new-api-user";

export interface SiteConfig {
  id: string;
  name: string;
  baseUrl: string;
  authType: AuthType;
  authValue: string;
  group: string;
  warningQuota: number | null;
}

export interface DashboardRange {
  startDate: string;
  endDate: string;
}

export interface DashboardRequest {
  baseUrl: string;
  authType: AuthType;
  authValue: string;
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
