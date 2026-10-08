/** Small display formatters used by domain components. Pure and locale-stable (en-US). */

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en-US");

/** `1234` → `1,234` */
export function formatNumber(value: number): string {
  return integer.format(value);
}

/** `12_400` → `12.4K` */
export function formatCompact(value: number): string {
  return compact.format(value);
}

/** `1` → `1 screen`, `3` → `3 screens` (custom plural optional). */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/** `1536000` → `1.5 MB` */
export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

/** `1440, 900` → `1440 × 900` */
export function formatDimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}

/** ISO date → `Oct 6, 2026`. Returns the input unchanged when it is not a valid date. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `https://www.linear.app/pricing?x=1` → `linear.app/pricing` */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/u, "");
    return `${parsed.hostname.replace(/^www\./u, "")}${path}`;
  } catch {
    return url;
  }
}

/** First letters of up to two words: `Screen Commons` → `OU`. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters = words.length > 1 ? [words[0]![0], words[1]![0]] : [name.trim()[0]];
  return letters.join("").toUpperCase() || "?";
}
