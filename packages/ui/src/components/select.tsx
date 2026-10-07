import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { popupSurfaceClassName } from "./popover";

export interface SelectOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  options: readonly SelectOption<T>[];
  value?: T | null;
  defaultValue?: T | null;
  onValueChange?: (value: T) => void;
  placeholder?: string;
  /** `filled` (grey control, forms) or `pill` (outlined pill, toolbars — e.g. "Latest ▾"). */
  variant?: "filled" | "pill" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  name?: string;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
  /** Popup alignment relative to the trigger. */
  align?: "start" | "center" | "end";
}

const triggerVariants = {
  filled:
    "rounded-control bg-muted hover:bg-muted-strong/70 data-[popup-open]:bg-muted-strong/70 px-3 justify-between",
  pill: "rounded-pill border border-border-strong bg-bg hover:bg-muted data-[popup-open]:bg-muted px-4",
  ghost: "rounded-pill px-2 hover:bg-muted data-[popup-open]:bg-muted -mx-2",
} as const;

/**
 * Single-select dropdown with a native-feeling list (keyboard typeahead, ↑/↓, Enter).
 *
 * ```tsx
 * <Select variant="pill" aria-label="Sort" value={sort} onValueChange={setSort}
 *   options={[{ value: "latest", label: "Latest" }, { value: "popular", label: "Most popular" }]} />
 * ```
 */
export function Select<T extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  variant = "filled",
  size = "md",
  disabled,
  name,
  required,
  id,
  className,
  align = "start",
  ...props
}: SelectProps<T>) {
  return (
    <BaseSelect.Root<T>
      items={options.map((option) => ({ value: option.value, label: option.label }))}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next);
      }}
      disabled={disabled}
      name={name}
      required={required}
    >
      <BaseSelect.Trigger
        id={id}
        aria-label={props["aria-label"]}
        className={cn(
          "ou-focus-ring inline-flex shrink-0 items-center gap-2 font-medium whitespace-nowrap text-fg select-none",
          "transition-colors duration-150 ease-out data-[disabled]:opacity-50",
          size === "md" ? "h-9 text-base" : "h-8 text-sm",
          variant === "filled" && (size === "md" ? "h-10 w-full" : "w-full"),
          triggerVariants[variant],
          className,
        )}
      >
        <BaseSelect.Value
          placeholder={placeholder}
          className="truncate data-[placeholder]:font-normal data-[placeholder]:text-fg-subtle"
        />
        <BaseSelect.Icon className="flex text-fg-muted">
          <ChevronDown aria-hidden className="size-4" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          sideOffset={6}
          align={align}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <BaseSelect.Popup
            className={cn(
              popupSurfaceClassName,
              "min-w-[max(var(--anchor-width),10rem)] origin-(--transform-origin) p-1",
            )}
          >
            <BaseSelect.List className="max-h-[min(var(--available-height),22rem)] scroll-py-1 overflow-y-auto">
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    "grid min-h-9 cursor-default grid-cols-[1fr_1rem] items-center gap-3 rounded-[7px] px-2.5 text-base text-fg outline-none select-none",
                    "data-[highlighted]:bg-muted data-[disabled]:opacity-40",
                  )}
                >
                  <BaseSelect.ItemText className="truncate">{option.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="flex text-fg">
                    <Check aria-hidden className="size-4" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
