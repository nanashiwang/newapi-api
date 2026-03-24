export function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));
}

export function formatDecimal(value: number, digits = 2): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
  }).format(value || 0);
}

export function formatUsd(value: number | null): string {
  if (value === null) {
    return "暂未获取";
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  if (Math.abs(value) < 10000) {
    return formatNumber(value);
  }

  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number | null): string {
  if (value === null) {
    return "暂无";
  }

  return `${formatDecimal(value, value >= 10 ? 1 : 2)}%`;
}

export function formatTimestampLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDate(base: Date, deltaDays: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + deltaDays);
  return next;
}

export function formatRunway(days: number | null): string {
  if (days === null) {
    return "暂无";
  }

  if (!Number.isFinite(days)) {
    return "∞";
  }

  if (days < 1) {
    return `${formatDecimal(days * 24, 1)} 小时`;
  }

  return `${formatDecimal(days, days < 10 ? 1 : 0)} 天`;
}

export function truncateLabel(value: string, maxLength = 18): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}
