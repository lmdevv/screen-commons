/**
 * Theme constants + the no-flash inline script. Kept free of React so it can be imported from
 * server code (e.g. a TanStack Start root route `head()`), not only from components.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "open-ui-theme";
export const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Inline script for `<head>` that applies the stored theme before first paint (no flash).
 * Render it as `<script dangerouslySetInnerHTML={{ __html: themeScript }} />` before any CSS-
 * dependent content, and put `suppressHydrationWarning` on `<html>`.
 */
export function createThemeScript(storageKey: string = THEME_STORAGE_KEY): string {
  return `(function(){try{var k=${JSON.stringify(storageKey)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.remove("light","dark");r.classList.add(d?"dark":"light");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
}

/** The default no-flash script string (storage key `open-ui-theme`). */
export const themeScript: string = createThemeScript();
