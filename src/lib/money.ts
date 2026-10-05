export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Parse "12", "12.5", "$12.50" into cents. Returns null when not a number. */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const n = typeof input === "number" ? input : Number(String(input).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}
