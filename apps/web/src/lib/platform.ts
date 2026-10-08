import { PLATFORMS, type Platform } from "@screen-commons/core/taxonomy";

export type { Platform };

export const PLATFORM_OPTIONS = PLATFORMS.map(({ slug, label }) => ({ value: slug, label }));

export function isPlatform(value: unknown): value is Platform {
  return value === "web" || value === "ios" || value === "android";
}

export function platformLabel(platform: Platform): string {
  return PLATFORMS.find((item) => item.slug === platform)?.label ?? "Web";
}

const STORAGE_KEY = "screen-commons-platform";

/** Last platform the user browsed (client only), so non-browse pages keep the switch in sync. */
export function rememberPlatform(platform: Platform): void {
  try {
    localStorage.setItem(STORAGE_KEY, platform);
  } catch {
    // Storage may be unavailable (private mode); the switch just falls back to Web.
  }
}

export function recallPlatform(): Platform | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isPlatform(value) ? value : null;
  } catch {
    return null;
  }
}
