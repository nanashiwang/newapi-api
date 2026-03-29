"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  PencilLine,
  RefreshCcw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import type { DashboardRange, SiteSummaryRow } from "@/lib/dashboard-types";
import {
  formatCompactNumber,
  formatNumber,
  formatTimestampLabel,
} from "@/lib/formatters";
import { formatQuotaUsd, quotaToUsd } from "@/lib/quota";

interface SiteBalanceTableProps {
  rows: SiteSummaryRow[];
  activeSiteId: string | null;
  isRefreshingAll: boolean;
  refreshingSiteId: string | null;
  range: DashboardRange;
  onSelect: (siteId: string) => void;
  onEditSite: (siteId: string) => void;
  onDeleteSite: (siteId: string) => void;
  onRefreshSite: (siteId: string) => void;
  onRefreshAll: () => void;
}

type SortMode =
  | "default"
  | "balance-asc"
  | "balance-desc"
  | "period-desc"
  | "requests-desc"
  | "synced-desc";

type TableTotals = {
  currentBalance: number | null;
  historicalUsage: number | null;
  periodQuota: number | null;
  totalRequests: number | null;
  activeModels: number | null;
};

type ExportColumn = {
  key:
    | "name"
    | "group"
    | "host"
    | "baseUrl"
    | "authType"
    | "currentBalance"
    | "warningQuota"
    | "warningState"
    | "historicalUsage"
    | "periodQuota"
    | "totalRequests"
    | "activeModels"
    | "status"
    | "lastSyncedAt"
    | "message";
  label: string;
};

type ExportRecord = Record<ExportColumn["key"], number | string>;

const DEFAULT_GROUP_LABEL = "未分组";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "default", label: "默认顺序" },
  { value: "balance-asc", label: "余额从低到高" },
  { value: "balance-desc", label: "余额从高到低" },
  { value: "period-desc", label: "区间消耗从高到低" },
  { value: "requests-desc", label: "请求数从高到低" },
  { value: "synced-desc", label: "最近同步优先" },
];

const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "name", label: "站点名称" },
  { key: "group", label: "分组" },
  { key: "host", label: "Host" },
  { key: "baseUrl", label: "Base URL" },
  { key: "authType", label: "鉴权" },
  { key: "currentBalance", label: "当前余额(USD)" },
  { key: "warningQuota", label: "低余额阈值" },
  { key: "warningState", label: "预警状态" },
  { key: "historicalUsage", label: "历史已用" },
  { key: "periodQuota", label: "区间消耗" },
  { key: "totalRequests", label: "请求数" },
  { key: "activeModels", label: "活跃模型数" },
  { key: "status", label: "状态" },
  { key: "lastSyncedAt", label: "最近同步" },
  { key: "message", label: "备注" },
];

function getStatusLabel(status: SiteSummaryRow["status"]) {
  if (status === "ready") {
    return "已同步";
  }

  if (status === "loading") {
    return "同步中";
  }

  if (status === "error") {
    return "失败";
  }

  return "待同步";
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

function sumNullable(
  rows: SiteSummaryRow[],
  selector: (row: SiteSummaryRow) => number | null,
): number | null {
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

function getTableTotals(rows: SiteSummaryRow[]): TableTotals {
  return {
    currentBalance: sumNullable(rows, (row) => row.currentBalance),
    historicalUsage: sumNullable(rows, (row) => row.historicalUsage),
    periodQuota: sumNullable(rows, (row) => row.periodQuota),
    totalRequests: sumNullable(rows, (row) => row.totalRequests),
    activeModels: sumNullable(rows, (row) => row.activeModels),
  };
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
}

function compareNullableDate(left: string | null, right: string | null): number {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  const leftTimestamp = new Date(left).getTime();
  const rightTimestamp = new Date(right).getTime();

  if (!Number.isFinite(leftTimestamp) && !Number.isFinite(rightTimestamp)) {
    return 0;
  }

  if (!Number.isFinite(leftTimestamp)) {
    return 1;
  }

  if (!Number.isFinite(rightTimestamp)) {
    return -1;
  }

  return rightTimestamp - leftTimestamp;
}

function sortRows(rows: SiteSummaryRow[], sortMode: SortMode): SiteSummaryRow[] {
  if (sortMode === "default") {
    return rows;
  }

  const nextRows = [...rows];

  nextRows.sort((left, right) => {
    if (sortMode === "balance-asc") {
      return (
        compareNullableNumber(left.currentBalance, right.currentBalance, "asc") ||
        left.name.localeCompare(right.name, "zh-CN")
      );
    }

    if (sortMode === "balance-desc") {
      return (
        compareNullableNumber(left.currentBalance, right.currentBalance, "desc") ||
        left.name.localeCompare(right.name, "zh-CN")
      );
    }

    if (sortMode === "period-desc") {
      return (
        compareNullableNumber(left.periodQuota, right.periodQuota, "desc") ||
        left.name.localeCompare(right.name, "zh-CN")
      );
    }

    if (sortMode === "requests-desc") {
      return (
        compareNullableNumber(left.totalRequests, right.totalRequests, "desc") ||
        left.name.localeCompare(right.name, "zh-CN")
      );
    }

    return (
      compareNullableDate(left.lastSyncedAt, right.lastSyncedAt) ||
      left.name.localeCompare(right.name, "zh-CN")
    );
  });

  return nextRows;
}

function formatLastSyncedAt(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) {
    return "--";
  }

  const timestamp = Math.floor(new Date(lastSyncedAt).getTime() / 1000);
  if (!Number.isFinite(timestamp)) {
    return lastSyncedAt;
  }

  return formatTimestampLabel(timestamp);
}

function formatMetric(value: number | null, mode: "default" | "compact" = "default") {
  if (value === null) {
    return "--";
  }

  return mode === "compact" ? formatCompactNumber(value) : formatNumber(value);
}

function sanitizeSpreadsheetText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsvCell(value: string): string {
  const sanitized = sanitizeSpreadsheetText(value);
  if (/[,"\r\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }

  return sanitized;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildExportRows(rows: SiteSummaryRow[]): ExportRecord[] {
  return rows.map((row) => ({
    name: row.name,
    group: getGroupLabel(row.group),
    host: row.host,
    baseUrl: row.baseUrl,
    authType: row.authTypeLabel,
    currentBalance: quotaToUsd(row.currentBalance) ?? "",
    warningQuota: row.warningQuota ?? "",
    warningState: isLowBalance(row) ? "预警" : "正常",
    historicalUsage: row.historicalUsage ?? "",
    periodQuota: row.periodQuota ?? "",
    totalRequests: row.totalRequests ?? "",
    activeModels: row.activeModels ?? "",
    status: getStatusLabel(row.status),
    lastSyncedAt: formatLastSyncedAt(row.lastSyncedAt),
    message: row.message ?? "",
  }));
}

function buildTotalRecord(rows: SiteSummaryRow[]): ExportRecord {
  const totals = getTableTotals(rows);
  const warningCount = rows.filter(isLowBalance).length;

  return {
    name: "总计（当前筛选）",
    group: `${rows.length} 个站点`,
    host: "",
    baseUrl: "",
    authType: "",
    currentBalance: quotaToUsd(totals.currentBalance) ?? "",
    warningQuota: "",
    warningState: warningCount > 0 ? `${warningCount} 个预警` : "正常",
    historicalUsage: totals.historicalUsage ?? "",
    periodQuota: totals.periodQuota ?? "",
    totalRequests: totals.totalRequests ?? "",
    activeModels: totals.activeModels ?? "",
    status: "汇总",
    lastSyncedAt: "",
    message: "",
  };
}

function downloadBlob(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportRowsToCsv(rows: SiteSummaryRow[], range: DashboardRange) {
  const records = [...buildExportRows(rows), buildTotalRecord(rows)];
  const lines = [
    EXPORT_COLUMNS.map((column) => escapeCsvCell(column.label)).join(","),
    ...records.map((record) =>
      EXPORT_COLUMNS.map((column) => escapeCsvCell(String(record[column.key] ?? ""))).join(","),
    ),
  ];

  downloadBlob(
    "\uFEFF" + lines.join("\r\n"),
    `newapi-sites-${range.startDate}_to_${range.endDate}.csv`,
    "text/csv;charset=utf-8;",
  );
}

function buildExcelCell(value: number | string): string {
  if (typeof value === "number") {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }

  return `<Cell><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetText(value))}</Data></Cell>`;
}

function exportRowsToExcel(rows: SiteSummaryRow[], range: DashboardRange) {
  const records = [...buildExportRows(rows), buildTotalRecord(rows)];
  const headerRow = `<Row>${EXPORT_COLUMNS.map((column) => buildExcelCell(column.label)).join("")}</Row>`;
  const bodyRows = records
    .map(
      (record) =>
        `<Row>${EXPORT_COLUMNS.map((column) => buildExcelCell(record[column.key])).join("")}</Row>`,
    )
    .join("");

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
>
  <Worksheet ss:Name="Sites">
    <Table>
      ${headerRow}
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;

  downloadBlob(
    workbook,
    `newapi-sites-${range.startDate}_to_${range.endDate}.xls`,
    "application/vnd.ms-excel;charset=utf-8;",
  );
}

export function SiteBalanceTable({
  rows,
  activeSiteId,
  isRefreshingAll,
  refreshingSiteId,
  range,
  onSelect,
  onEditSite,
  onDeleteSite,
  onRefreshSite,
  onRefreshAll,
}: SiteBalanceTableProps) {
  const [keyword, setKeyword] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(rows.map((row) => getGroupLabel(row.group))));

    return groups.sort((left, right) => {
      if (left === DEFAULT_GROUP_LABEL) {
        return 1;
      }

      if (right === DEFAULT_GROUP_LABEL) {
        return -1;
      }

      return left.localeCompare(right, "zh-CN");
    });
  }, [rows]);

  const effectiveGroupFilter =
    groupFilter === "all" || groupOptions.includes(groupFilter) ? groupFilter : "all";

  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      const rowGroup = getGroupLabel(row.group);
      const matchesGroup =
        effectiveGroupFilter === "all" || rowGroup === effectiveGroupFilter;
      const matchesKeyword =
        !normalizedKeyword ||
        [row.name, row.host, row.baseUrl, rowGroup]
          .join(" ")
          .toLowerCase()
          .includes(normalizedKeyword);

      return matchesGroup && matchesKeyword;
    });
  }, [rows, keyword, effectiveGroupFilter]);

  const visibleRows = useMemo(() => sortRows(filteredRows, sortMode), [filteredRows, sortMode]);

  const sections = useMemo(() => {
    const grouped = new Map<string, SiteSummaryRow[]>();

    for (const row of visibleRows) {
      const groupLabel = getGroupLabel(row.group);
      const sectionRows = grouped.get(groupLabel) ?? [];
      sectionRows.push(row);
      grouped.set(groupLabel, sectionRows);
    }

    return Array.from(grouped.entries()).map(([label, sectionRows]) => ({
      label,
      rows: sectionRows,
      totals: getTableTotals(sectionRows),
      warningCount: sectionRows.filter(isLowBalance).length,
    }));
  }, [visibleRows]);

  const totals = useMemo(() => getTableTotals(visibleRows), [visibleRows]);
  const warningCount = useMemo(() => visibleRows.filter(isLowBalance).length, [visibleRows]);

  return (
    <section className="surface-card p-6">
      <div className="flex flex-col gap-4 border-b border-white/8 pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="stat-note">Multi Site Balance Board</p>
          <h2 className="section-title mt-2">多站点余额表</h2>
          <p className="muted-copy mt-2 max-w-3xl">
            支持搜索、分组、排序、低余额预警、分组小计和 CSV / Excel 导出。
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="secondary-button"
            onClick={() => exportRowsToCsv(visibleRows, range)}
            disabled={visibleRows.length === 0}
          >
            <Download className="size-4" />
            导出 CSV
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => exportRowsToExcel(visibleRows, range)}
            disabled={visibleRows.length === 0}
          >
            <FileSpreadsheet className="size-4" />
            导出 Excel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onRefreshAll}
            disabled={isRefreshingAll || rows.length === 0}
          >
            {isRefreshingAll ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            刷新全部站点
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state mt-6 min-h-[260px]">
          先保存至少一个 NewAPI 站点，这里就会生成跨站点余额表。
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_220px_220px]">
            <label className="space-y-2">
              <span className="field-label">搜索站点</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  className="field-input pl-11"
                  placeholder="按站点名、Host、URL 或分组筛选"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className="field-label">分组筛选</span>
              <select
                className="field-input"
                value={effectiveGroupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
              >
                <option value="all">全部分组</option>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="field-label">排序方式</span>
              <div className="relative">
                <ArrowDownUp className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                <select
                  className="field-input pl-11"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="soft-badge border-[rgba(110,168,254,0.18)] bg-[rgba(110,168,254,0.12)] text-[#dbe8ff]">
              显示 {visibleRows.length} / {rows.length} 个站点
            </span>
            <span className="soft-badge">{effectiveGroupFilter === "all" ? "全部分组" : effectiveGroupFilter}</span>
            <span className="soft-badge border-[rgba(255,176,32,0.18)] bg-[rgba(255,176,32,0.12)] text-[#ffd479]">
              {warningCount} 个低余额预警
            </span>
          </div>

          {visibleRows.length === 0 ? (
            <div className="empty-state mt-6 min-h-[220px]">没有符合当前筛选条件的站点。</div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-[18px] border border-white/8 bg-[var(--panel-2)]">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/8 bg-[rgba(255,255,255,0.02)] text-left text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                      <th className="px-4 py-4">站点名称</th>
                      <th className="px-4 py-4">Host</th>
                      <th className="px-4 py-4">分组</th>
                      <th className="px-4 py-4">当前余额(USD)</th>
                      <th className="px-4 py-4">阈值</th>
                      <th className="px-4 py-4">区间消耗</th>
                      <th className="px-4 py-4">请求数</th>
                      <th className="px-4 py-4">最近同步</th>
                      <th className="px-4 py-4 text-right">操作</th>
                    </tr>
                  </thead>

                  {sections.map((section) => (
                    <tbody key={section.label}>
                      <tr className="group-row">
                        <td className="px-4 py-3" colSpan={9}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="soft-badge border-[rgba(110,168,254,0.18)] bg-[rgba(110,168,254,0.12)] text-[#dbe8ff]">
                                {section.label}
                              </span>
                              <span className="text-xs font-semibold text-[var(--muted)]">
                                {section.rows.length} 个站点
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs font-semibold">
                              {section.warningCount > 0 ? (
                                <span className="soft-badge border-[rgba(255,91,91,0.18)] bg-[rgba(255,91,91,0.12)] text-[#ff9d9d]">
                                  <TriangleAlert className="size-3" />
                                  {section.warningCount} 个预警
                                </span>
                              ) : null}
                              <span className="soft-badge">小计余额 {formatQuotaUsd(section.totals.currentBalance)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {section.rows.map((row) => {
                        const isActive = row.id === activeSiteId;
                        const isRefreshing = refreshingSiteId === row.id;
                        const lowBalance = isLowBalance(row);

                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-white/8 align-top transition ${
                              lowBalance
                                ? "bg-[rgba(255,91,91,0.08)]"
                                : isActive
                                  ? "bg-[rgba(110,168,254,0.08)]"
                                  : "bg-transparent hover:bg-[rgba(255,255,255,0.03)]"
                            }`}
                          >
                            <td className="px-4 py-4">
                              <div>
                                <button
                                  type="button"
                                  onClick={() => onSelect(row.id)}
                                  className="text-left text-sm font-semibold text-[var(--text)]"
                                >
                                  {row.name}
                                </button>
                                {row.message ? (
                                  <p className="mt-2 max-w-[320px] text-xs leading-5 text-[#ff9d9d]">
                                    {row.message}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-[var(--muted)]">{row.host}</td>
                            <td className="px-4 py-4">
                              <span className="soft-badge text-[#dce6ff]">{getGroupLabel(row.group)}</span>
                            </td>
                            <td className={`px-4 py-4 font-semibold ${lowBalance ? "text-[#ff9d9d]" : "text-[#dce6ff]"}`}>
                              {formatQuotaUsd(row.currentBalance)}
                            </td>
                            <td className="px-4 py-4 text-[var(--muted)]">
                              {row.warningQuota === null ? "--" : formatNumber(row.warningQuota)}
                            </td>
                            <td className="px-4 py-4 text-[var(--muted)]">{formatMetric(row.periodQuota)}</td>
                            <td className="px-4 py-4 text-[var(--muted)]">
                              {formatMetric(row.totalRequests, "compact")}
                            </td>
                            <td className="px-4 py-4 text-[var(--muted)]">{formatLastSyncedAt(row.lastSyncedAt)}</td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                                    isActive
                                      ? "bg-[linear-gradient(135deg,#6ea8fe,#4f7df0)] text-white"
                                      : "border border-white/8 bg-[var(--panel)] text-[var(--text)] hover:bg-[var(--panel-3)]"
                                  }`}
                                  onClick={() => onSelect(row.id)}
                                >
                                  {isActive ? "当前站点" : "查看详情"}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-[var(--panel)] px-3 py-2 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--panel-3)]"
                                  onClick={() => onEditSite(row.id)}
                                >
                                  <PencilLine className="size-3" />
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-white/8 bg-[var(--panel)] px-3 py-2 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--panel-3)] disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => onRefreshSite(row.id)}
                                  disabled={isRefreshing}
                                >
                                  {isRefreshing ? (
                                    <span className="inline-flex items-center gap-1">
                                      <LoaderCircle className="size-3 animate-spin" />
                                      刷新中
                                    </span>
                                  ) : (
                                    "单站刷新"
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,91,91,0.18)] bg-[rgba(255,91,91,0.12)] px-3 py-2 text-xs font-semibold text-[#ff9d9d] transition hover:bg-[rgba(255,91,91,0.18)]"
                                  onClick={() => onDeleteSite(row.id)}
                                >
                                  <Trash2 className="size-3" />
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}

                  <tfoot>
                    <tr className="bg-[rgba(110,168,254,0.12)] text-[#dbe8ff]">
                      <td className="px-4 py-4 text-sm font-semibold">总计（当前筛选）</td>
                      <td className="px-4 py-4 text-sm font-semibold">--</td>
                      <td className="px-4 py-4 text-sm font-semibold">{visibleRows.length} 个站点</td>
                      <td className="px-4 py-4 text-sm font-semibold">{formatQuotaUsd(totals.currentBalance)}</td>
                      <td className="px-4 py-4 text-sm font-semibold">--</td>
                      <td className="px-4 py-4 text-sm font-semibold">{formatMetric(totals.periodQuota)}</td>
                      <td className="px-4 py-4 text-sm font-semibold">{formatMetric(totals.totalRequests, "compact")}</td>
                      <td className="px-4 py-4 text-sm font-semibold">--</td>
                      <td className="px-4 py-4 text-right text-sm font-semibold">
                        {warningCount > 0 ? `${warningCount} 个预警` : "正常"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

