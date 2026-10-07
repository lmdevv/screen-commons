const KEY = "open-ui-recent-searches";
const MAX = 5;

export function readRecentSearches(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): void {
  const q = query.trim();
  if (!q) return;
  const next = [q, ...readRecentSearches().filter((item) => item.toLowerCase() !== q.toLowerCase())];
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX)));
  } catch {
    // Ignore: recent searches are a nicety.
  }
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}
