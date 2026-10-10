import type { AppSummary, FlowDetail, Screen } from "@screen-commons/core";
import {
  PATTERNS,
  type CategorySlug,
  type ElementSlug,
  type FlowTypeSlug,
  type PatternSlug,
  type Platform,
} from "@screen-commons/core/taxonomy";

import type { ProcessedImage } from "./image-processing";

export const MAX_SCREENS = 30;

/**
 * Pattern labels by slug. (`labelFor` from core is ambiguous for slugs shared with flow types,
 * e.g. "settings" → "Changing Settings".)
 */
const PATTERN_LABELS = new Map<string, string>(PATTERNS.map((p) => [p.slug, p.label]));
export const patternLabel = (slug: string) => PATTERN_LABELS.get(slug) ?? slug;

export interface UploadState {
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  screen?: Screen;
}

export interface Draft {
  id: string;
  file: File;
  /** SHA-256 of the file's bytes: the same image can't be added twice. */
  hash: string;
  name: string;
  /** Object URL of the generated thumbnail (or the file while processing). */
  previewUrl: string;
  status: "processing" | "ready" | "invalid";
  error?: string;
  processed?: ProcessedImage;
  title: string;
  patterns: PatternSlug[];
  elements: ElementSlug[];
  stepLabel: string;
  upload: UploadState;
}

export interface NewApp {
  name: string;
  websiteUrl: string;
  category: CategorySlug | "";
  tagline: string;
}

export type AppChoice = { mode: "existing"; app: AppSummary } | { mode: "new" };

export interface FlowOptions {
  enabled: boolean;
  name: string;
  type: FlowTypeSlug | "";
}

export interface SubmitState {
  phase: "idle" | "uploading" | "done" | "error";
  flow?: FlowDetail;
  flowError?: string;
}

export interface WizardState {
  step: number;
  platform: Platform;
  drafts: Draft[];
  app: AppChoice | null;
  newApp: NewApp;
  flow: FlowOptions;
  submit: SubmitState;
}

export const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "app", label: "App" },
  { id: "screens", label: "Screens" },
  { id: "review", label: "Review" },
] as const;

export const initialState = (): WizardState => ({
  step: 0,
  platform: "web",
  drafts: [],
  app: null,
  newApp: { name: "", websiteUrl: "", category: "", tagline: "" },
  flow: { enabled: false, name: "", type: "" },
  submit: { phase: "idle" },
});

/** Hex SHA-256 of a file's bytes (what the server dedupes uploads by). */
export async function contentHash(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const frameKindOf = (platform: Platform) => (platform === "web" ? "web" : "mobile");

/** "linear-pricing_page@2x.png" → "Linear pricing page"; camera-roll names → "". */
export function titleFromFilename(name: string): string {
  const base = name
    .replace(/\.[a-z0-9]+$/iu, "")
    .replace(/@\dx$/u, "")
    .trim();
  if (/^(screen ?shot|screenshot|image|img|photo|capture|clipboard|untitled|pasted)\b/iu.test(base))
    return "";
  if (/^[\d\s_.:-]+$/u.test(base)) return "";
  const words = base
    .replace(/[_\-.]+/gu, " ")
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/\s+/gu, " ")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : "";
}

/** Suggest patterns from a title / filename using the taxonomy's match words. */
export function suggestPatternsFromText(text: string): PatternSlug[] {
  const normalized = `-${text.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}-`;
  if (normalized === "--") return [];
  const found: PatternSlug[] = [];
  for (const pattern of PATTERNS) {
    const words = [
      pattern.slug,
      pattern.label.toLowerCase().replace(/\s+/gu, "-"),
      ...("match" in pattern ? pattern.match : []),
    ];
    if (words.some((word) => word.length >= 3 && normalized.includes(`-${word}-`))) {
      found.push(pattern.slug);
    }
    if (found.length === 3) break;
  }
  return found;
}

/** Patterns shown by default in the per-screen picker (plus anything selected or suggested). */
export const COMMON_PATTERNS: PatternSlug[] = [
  "landing",
  "pricing",
  "login",
  "signup",
  "onboarding",
  "dashboard",
  "settings",
  "checkout",
];

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Accepts "linear.app" and adds https://. */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
}
