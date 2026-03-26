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
  { value: "synced-desc", label: "最近同步最新" },
];

const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "name", label: "站点名称" },
  { key: "group", label: "分组" },
  { key: "host", label: "Host" },
  { key: "baseUrl", label: "Base URL" },
  { key: "authType", label: "鉴权" },
  { key: "currentBalance", label: "当前余额" },
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

function getStatusStyles(status: SiteSummaryRow["status"]) {
  if (status === "ready") {
    return "bg-[#e6f6f3] text-[#0f5c56]";
  }

  if (status === "loading") {
    return "bg-[#fff4db] text-[#9c6500]";
  }

  if (status === "error") {
    return "bg-[#ffe9e3] text-[#b34d33]";
  }

  return "bg-[#eef2f3] text-[#607176]";
}

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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildExportRows(rows: SiteSummaryRow[]): ExportRecord[] {
  return rows.map((row) => ({
    name: row.name,
    group: getGroupLabel(row.group),
    host: row.host,
    baseUrl: row.baseUrl,
    authType: row.authTypeLabel,
    currentBalance: row.currentBalance ?? "",
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
    currentBalance: totals.currentBalance ?? "",
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

  const visibleRows = useMemo(
    () => sortRows(filteredRows, sortMode),
    [filteredRows, sortMode],
  );

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
  const warningCount = useMemo(
    () => visibleRows.filter(isLowBalance).length,
    [visibleRows],
  );

  return (
    <section className="surface-card p-6">
      <div className="flex flex-col gap-4 border-b border-black/5 pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="stat-note">Multi Site Balance Board</p>
          <h2 className="section-title mt-2">多站点余额表</h2>
          <p className="muted-copy mt-2 max-w-3xl">
            现在可以按分组查看多个 NewAPI 实例，支持搜索、排序、低余额高亮，以及将当前筛选结果导出为
            CSV 或 Excel。
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
            className="secondary-button"
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
        <div className="mt-6 flex min-h-[260px] items-center justify-center rounded-[1.5rem] bg-[#fbfaf5] text-center text-sm text-[#5c6d71]">
          先在左侧保存至少一个 NewAPI 站点，这里就会生成跨站点余额表。
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_220px_220px]">
            <label className="space-y-2">
              <span className="field-label">搜索站点</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#7a898d]" />
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
                <ArrowDownUp className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#7a898d]" />
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
            <span className="inline-flex rounded-full bg-[#e6f6f3] px-3 py-1 text-xs font-semibold text-[#0f5c56]">
              显示 {visibleRows.length} / {rows.length} 个站点
            </span>
            <span className="inline-flex rounded-full bg-[#f3eee4] px-3 py-1 text-xs font-semibold text-[#6a777b]">
              {effectiveGroupFilter === "all" ? "全部分组" : effectiveGroupFilter}
            </span>
            <span className="inline-flex rounded-full bg-[#fff7ed] px-3 py-1 text-xs font-semibold text-[#9c6500]">
              {warningCount} 个低余额预警
            </span>
          </div>

          {visibleRows.length === 0 ? (
            <div className="mt-6 flex min-h-[220px] items-center justify-center rounded-[1.5rem] border border-dashed border-black/10 bg-[#fbfaf5] text-center text-sm text-[#5c6d71]">
              没有符合当前搜索或分组筛选条件的站点。
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-black/5 bg-[#fbfaf5]">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-black/5 text-left text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#718186]">
                      <th className="px-4 py-4">站点</th>
                      <th className="px-4 py-4">余额</th>
                      <th className="px-4 py-4">历史已用</th>
                      <th className="px-4 py-4">区间消耗</th>
                      <th className="px-4 py-4">请求</th>
                      <th className="px-4 py-4">活跃模型</th>
                      <th className="px-4 py-4">鉴权</th>
                      <th className="px-4 py-4">状态</th>
                      <th className="px-4 py-4">最近同步</th>
                      <th className="px-4 py-4 text-right">操作</th>
                    </tr>
                  </thead>

                  {sections.map((section) => (
                    <tbody key={section.label}>
                      <tr className="border-y border-black/5 bg-[#f3eee4]/70">
                        <td className="px-4 py-3" colSpan={10}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1d2529]">
                                {section.label}
                              </span>
                              <span className="text-xs font-semibold text-[#6a777b]">
                                {section.rows.length} 个站点
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs font-semibold">
                              {section.warningCount > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#fff2ee] px-3 py-1 text-[#b34d33]">
                                  <TriangleAlert className="size-3" />
                                  {section.warningCount} 个预警
                                </span>
                              ) : null}
                              <span className="rounded-full bg-white px-3 py-1 text-[#6a777b]">
                                余额小计 {formatMetric(section.totals.currentBalance)}
                              </span>
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
                            className={`border-b border-black/5 align-top transition ${
                              lowBalance
                                ? isActive
                                  ? "bg-[#fff3ee]"
                                  : "bg-[#fff9f6] hover:bg-[#fff4ef]"
                                : isActive
                                  ? "bg-white"
                                  : "bg-transparent hover:bg-white/70"
                            }`}
                          >
                            <td className="px-4 py-4">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onSelect(row.id)}
                                    className="text-left text-sm font-semibold text-[#1d2529]"
                                  >
                                    {row.name}
                                  </button>
                                  <span className="rounded-full bg-[#f3eee4] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#6a777b]">
                                    {getGroupLabel(row.group)}
                                  </span>
                                  {lowBalance ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0ec] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#b34d33]">
                                      <TriangleAlert className="size-3" />
                                      低余额
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-2 max-w-[280px] break-all text-xs text-[#5c6d71]">
                                  {row.host}
                                </p>
                                {row.message ? (
                                  <p className="mt-2 max-w-[320px] text-xs leading-5 text-[#b34d33]">
                                    {row.message}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td
                              className={`px-4 py-4 font-semibold ${
                                lowBalance ? "text-[#b34d33]" : "text-[#1d2529]"
                              }`}
                            >
                              <div>
                                <p>{formatMetric(row.currentBalance)}</p>
                                {row.warningQuota !== null ? (
                                  <p className="mt-1 text-xs font-medium text-[#8b5b4d]">
                                    阈值 {formatNumber(row.warningQuota)}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-[#4f5d62]">
                              {formatMetric(row.historicalUsage)}
                            </td>
                            <td className="px-4 py-4 text-[#4f5d62]">
                              {formatMetric(row.periodQuota)}
                            </td>
                            <td className="px-4 py-4 text-[#4f5d62]">
                              {formatMetric(row.totalRequests, "compact")}
                            </td>
                            <td className="px-4 py-4 text-[#4f5d62]">
                              {formatMetric(row.activeModels)}
                            </td>
                            <td className="px-4 py-4 text-[#4f5d62]">{row.authTypeLabel}</td>
                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusStyles(row.status)}`}
                              >
                                {getStatusLabel(row.status)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-[#4f5d62]">
                              {formatLastSyncedAt(row.lastSyncedAt)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                                    isActive
                                      ? "bg-[#1d2529] text-white"
                                      : "bg-white text-[#1d2529] hover:bg-[#f3eee4]"
                                  }`}
                                  onClick={() => onSelect(row.id)}
                                >
                                  {isActive ? "当前站点" : "查看详情"}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#4f5d62] transition hover:bg-[#f3eee4]"
                                  onClick={() => onEditSite(row.id)}
                                >
                                  <PencilLine className="size-3" />
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#4f5d62] transition hover:bg-[#f3eee4] disabled:cursor-not-allowed disabled:opacity-60"
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
                                  className="inline-flex items-center gap-1 rounded-full bg-[#fff2ee] px-3 py-2 text-xs font-semibold text-[#b34d33] transition hover:bg-[#ffe6de]"
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

                      <tr className="border-b border-black/5 bg-white/65 text-xs font-semibold text-[#6a777b]">
                        <td className="px-4 py-3">{section.label} 小计</td>
                        <td className="px-4 py-3">{formatMetric(section.totals.currentBalance)}</td>
                        <td className="px-4 py-3">{formatMetric(section.totals.historicalUsage)}</td>
                        <td className="px-4 py-3">{formatMetric(section.totals.periodQuota)}</td>
                        <td className="px-4 py-3">
                          {formatMetric(section.totals.totalRequests, "compact")}
                        </td>
                        <td className="px-4 py-3">{formatMetric(section.totals.activeModels)}</td>
                        <td className="px-4 py-3">--</td>
                        <td className="px-4 py-3">{section.rows.length} 个站点</td>
                        <td className="px-4 py-3">--</td>
                        <td className="px-4 py-3 text-right">--</td>
                      </tr>
                    </tbody>
                  ))}

                  <tfoot>
                    <tr className="bg-[#1d2529] text-white">
                      <td className="px-4 py-4 text-sm font-semibold">总计（当前筛选）</td>
                      <td className="px-4 py-4 text-sm font-semibold">
                        {formatMetric(totals.currentBalance)}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold">
                        {formatMetric(totals.historicalUsage)}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold">
                        {formatMetric(totals.periodQuota)}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold">
                        {formatMetric(totals.totalRequests, "compact")}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold">
                        {formatMetric(totals.activeModels)}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold">--</td>
                      <td className="px-4 py-4 text-sm font-semibold">
                        {visibleRows.length} 个站点
                      </td>
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
