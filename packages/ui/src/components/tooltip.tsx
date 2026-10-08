import * as React from "react";

import { cn } from "../lib/cn";
import { useShortcutHint } from "./kbd";

/*
 * Lightweight tooltip — deliberately not built on a floating-position engine (that costs ~25 KB
 * gzip on routes that otherwise have no popups). Tooltips here label icon buttons in bars, so a
 * CSS-positioned bubble with `side`/`align` is enough.
 *
 * Behaviour: opens after `delay` on hover, immediately on keyboard focus (focus-visible) and
 * immediately for neighbours once one tooltip has been shown ("warm" period); Esc dismisses
 * (WCAG 1.4.13). The trigger must carry its own `aria-label`; the bubble is a visual aid.
 */

interface TooltipConfig {
  delay: number;
  warmUntil: React.RefObject<number>;
}

const TooltipContext = React.createContext<TooltipConfig | null>(null);

export interface TooltipProviderProps {
  children: React.ReactNode;
  /** Hover delay in ms before the first tooltip opens. Default 450. */
  delay?: number;
}

/** Optional: shares the hover delay and the "warm" state between tooltips. */
export function TooltipProvider({ children, delay = 450 }: TooltipProviderProps) {
  const warmUntil = React.useRef(0);
  const value = React.useMemo(() => ({ delay, warmUntil }), [delay]);
  return <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>;
}

const fallbackWarm = { current: 0 };

export interface TooltipProps {
  /** Tooltip text. Keep it to a few words. */
  content: React.ReactNode;
  /**
   * Shortcut in `useHotkey` notation (`"z"`, `"mod+c"`, `"g s"`), shown after the text and exposed
   * on the trigger (`aria-keyshortcuts`, or a description for a sequence).
   */
  shortcut?: string;
  /** A single focusable element (usually an icon Button). */
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  disabled?: boolean;
}

/**
 * `<Tooltip content="Saved"><Button icon variant="ghost" aria-label="Saved"><Bookmark /></Button></Tooltip>`
 * Use `align="end"` for triggers near the right edge of the viewport.
 */
export function Tooltip({
  content,
  shortcut,
  children,
  side = "bottom",
  align = "center",
  disabled = false,
}: TooltipProps) {
  const config = React.useContext(TooltipContext);
  const delay = config?.delay ?? 450;
  const warmUntil = config?.warmUntil ?? fallbackWarm;
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hint = useShortcutHint(shortcut, { tone: "chrome" });

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const show = (immediate: boolean) => {
    if (disabled) return;
    clearTimeout(timer.current);
    if (immediate || Date.now() < warmUntil.current) setOpen(true);
    else timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen((wasOpen) => {
      if (wasOpen) warmUntil.current = Date.now() + 400;
      return false;
    });
  };

  const childProps = children.props;
  const trigger = React.cloneElement(children, {
    ...hint.props,
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      childProps.onPointerEnter?.(event);
      if (event.pointerType === "mouse") show(false);
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      childProps.onPointerLeave?.(event);
      hide();
    },
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      childProps.onPointerDown?.(event);
      hide();
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(event);
      if (event.currentTarget.matches?.(":focus-visible")) show(true);
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(event);
      hide();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      childProps.onKeyDown?.(event);
      if (event.key === "Escape" && open) {
        event.stopPropagation();
        hide();
      }
    },
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      <span
        role="tooltip"
        aria-hidden
        data-open={open ? "" : undefined}
        className={cn(
          "pointer-events-none absolute z-[60] flex items-center gap-2 rounded-sm bg-chrome px-2 py-1 text-sm font-medium whitespace-nowrap text-chrome-fg",
          "invisible opacity-0 transition-[opacity,translate,visibility] duration-120 ease-out data-[open]:visible data-[open]:translate-y-0 data-[open]:opacity-100",
          side === "bottom" ? "top-full mt-2 -translate-y-0.5" : "bottom-full mb-2 translate-y-0.5",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
        )}
      >
        {content}
        {hint.hint}
      </span>
      {hint.description}
    </span>
  );
}
