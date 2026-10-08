import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge configured for Screen Commons's custom type scale, so `text-sm` (font size) and
 * `text-fg-muted` (colour) are not treated as conflicting classes.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl"],
      radius: ["xs", "sm", "shot", "control", "card", "tile", "overlay", "pill"],
      shadow: ["overlay", "raised"],
    },
  },
});

/** Join class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
