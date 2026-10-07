import { Monitor, Moon, Sun } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";
import { isTheme, THEME_STORAGE_KEY, type ResolvedTheme, type Theme } from "../lib/theme";
import { SegmentedControl } from "./segmented-control";

export { createThemeScript, themeScript, THEME_STORAGE_KEY } from "../lib/theme";
export type { ResolvedTheme, Theme } from "../lib/theme";

interface ThemeContextValue {
  /** User preference. */
  theme: Theme;
  /** What is actually applied (system preference resolved). */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const MEDIA = "(prefers-color-scheme: dark)";

function systemTheme(): ResolvedTheme {
  return typeof window !== "undefined" && window.matchMedia?.(MEDIA).matches ? "dark" : "light";
}

function readStored(storageKey: string): Theme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(resolved: ResolvedTheme, disableTransitions: boolean) {
  const root = document.documentElement;
  let cleanup: (() => void) | undefined;
  if (disableTransitions) {
    root.classList.add("ou-no-transitions");
    cleanup = () => root.classList.remove("ou-no-transitions");
  }
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  if (cleanup) {
    // Force a style flush, then re-enable transitions on the next frame.
    void window.getComputedStyle(root).opacity;
    requestAnimationFrame(cleanup);
  }
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Used when nothing is stored. Default `"system"`. */
  defaultTheme?: Theme;
  storageKey?: string;
  /** Force a theme (e.g. for a marketing page). Ignores storage. */
  forcedTheme?: ResolvedTheme;
}

/**
 * Class-strategy theming: toggles `.light` / `.dark` on `<html>`, persists to localStorage, follows
 * the OS when set to "system". Pair it with `themeScript` in `<head>` to avoid a flash.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = THEME_STORAGE_KEY,
  forcedTheme,
}: ThemeProviderProps) {
  // Start from the default on both server and client to keep hydration stable; sync after mount.
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [system, setSystem] = React.useState<ResolvedTheme>("light");
  // Until storage has been read we don't touch <html>: the inline script already set the class.
  const [ready, setReady] = React.useState(false);
  const mounted = React.useRef(false);

  React.useEffect(() => {
    setThemeState(readStored(storageKey) ?? defaultTheme);
    setSystem(systemTheme());
    setReady(true);
    const media = window.matchMedia?.(MEDIA);
    const onChange = () => setSystem(media.matches ? "dark" : "light");
    media?.addEventListener("change", onChange);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey)
        setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      media?.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [storageKey, defaultTheme]);

  const resolvedTheme: ResolvedTheme = forcedTheme ?? (theme === "system" ? system : theme);

  React.useEffect(() => {
    if (!ready) return;
    applyTheme(resolvedTheme, mounted.current);
    mounted.current = true;
  }, [resolvedTheme, ready]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // storage unavailable (private mode): keep in memory only
      }
    },
    [storageKey],
  );

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Current theme + setter. Must be used inside `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
  return context;
}

/** Like `useTheme`, but returns `null` outside a provider (for components that adapt if present). */
export function useOptionalTheme(): ThemeContextValue | null {
  return React.useContext(ThemeContext);
}

export const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const satisfies readonly { value: Theme; label: string; icon: unknown }[];

export interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md";
}

/** Light / Dark / System segmented switch with icons (footer, settings). */
export function ThemeToggle({ className, size = "sm" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl<Theme>
      aria-label="Theme"
      size={size}
      className={cn(className)}
      value={theme}
      onValueChange={setTheme}
      options={THEME_OPTIONS.map(({ value, label, icon: Icon }) => ({
        value,
        ariaLabel: label,
        label: <Icon aria-hidden />,
      }))}
    />
  );
}
