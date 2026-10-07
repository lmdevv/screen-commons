import * as React from "react";

import { cn } from "../lib/cn";
import { useControllableState } from "../lib/hooks";

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  /** Accessible label when `label` is an icon. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange" | "defaultValue"
> {
  options: readonly SegmentedControlOption<T>[];
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  /** Accessible name for the group, e.g. "Platform". */
  "aria-label": string;
  size?: "sm" | "md";
}

/**
 * Single-choice segmented switch (Web / iOS / Android). Semantics are a radio group: one tab
 * stop, ←/→ (and ↑/↓, Home/End) move *and* select, like native radios.
 */
export function SegmentedControl<T extends string = string>({
  options,
  value: valueProp,
  defaultValue,
  onValueChange,
  size = "md",
  className,
  ...props
}: SegmentedControlProps<T>) {
  const firstEnabled = options.find((option) => !option.disabled)?.value;
  const [value, setValue] = useControllableState<T | undefined>({
    value: valueProp,
    defaultValue: defaultValue ?? firstEnabled,
    onChange: (next) => {
      if (next !== undefined) onValueChange?.(next);
    },
  });
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const enabledIndexes = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);

  function select(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setValue(option.value);
    refs.current[index]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const position = enabledIndexes.indexOf(index);
    let next: number | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = enabledIndexes[(position + 1) % enabledIndexes.length];
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = enabledIndexes[(position - 1 + enabledIndexes.length) % enabledIndexes.length];
        break;
      case "Home":
        next = enabledIndexes[0];
        break;
      case "End":
        next = enabledIndexes[enabledIndexes.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== undefined) select(next);
  }

  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex shrink-0 items-center rounded-pill bg-muted p-[3px]",
        size === "md" ? "h-9" : "h-8",
        className,
      )}
      {...props}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            tabIndex={checked || (value === undefined && index === enabledIndexes[0]) ? 0 : -1}
            data-checked={checked ? "" : undefined}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "ou-focus-ring flex h-full items-center justify-center gap-1.5 rounded-pill font-medium whitespace-nowrap",
              "transition-[background-color,color,box-shadow] duration-150 ease-out disabled:opacity-40",
              size === "md" ? "px-3.5 text-base" : "px-3 text-sm",
              "[&_svg]:size-4",
              checked ? "bg-bg text-fg shadow-raised" : "text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
