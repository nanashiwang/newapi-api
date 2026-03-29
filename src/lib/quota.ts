const QUOTA_PER_USD = 500000;

export function quotaToUsd(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return value / QUOTA_PER_USD;
}

export function formatQuotaUsd(value: number | null): string {
  const usdValue = quotaToUsd(value);
  if (usdValue === null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usdValue);
}
