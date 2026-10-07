import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Check, Minus } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";

export interface CheckboxProps extends React.ComponentProps<typeof BaseCheckbox.Root> {
  /** Inline label rendered to the right; clicking it toggles the box. */
  label?: React.ReactNode;
  description?: React.ReactNode;
}

/** Checkbox (supports `indeterminate`). Black fill when checked. */
export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  const box = (
    <BaseCheckbox.Root
      className={cn(
        "ou-focus-ring flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-control-border bg-bg text-inverse-fg",
        "transition-[background-color,border-color] duration-120 ease-out hover:border-fg-muted",
        "data-[checked]:border-inverse data-[checked]:bg-inverse data-[indeterminate]:border-inverse data-[indeterminate]:bg-inverse",
        "data-[disabled]:opacity-45",
        label ? undefined : className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator
        className="flex data-[unchecked]:hidden"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? (
              <Minus aria-hidden className="size-3" strokeWidth={3} />
            ) : (
              <Check aria-hidden className="size-3" strokeWidth={3} />
            )}
          </span>
        )}
      />
    </BaseCheckbox.Root>
  );
  if (!label) return box;
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-base text-fg", className)}>
      <span className="flex h-5 items-center">{box}</span>
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {description ? <span className="text-sm text-fg-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export interface SwitchProps extends React.ComponentProps<typeof BaseSwitch.Root> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md";
}

/** On/off switch for immediate settings. */
export function Switch({ label, description, size = "md", className, ...props }: SwitchProps) {
  const control = (
    <BaseSwitch.Root
      className={cn(
        "ou-focus-ring relative inline-flex shrink-0 items-center rounded-pill bg-control-border p-0.5",
        "transition-colors duration-150 ease-out data-[checked]:bg-inverse data-[disabled]:opacity-45",
        size === "md" ? "h-6 w-10" : "h-5 w-8",
        label ? undefined : className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          "block rounded-full bg-white data-[checked]:bg-bg shadow-[0_1px_2px_rgb(0_0_0/0.18)] transition-transform duration-150 ease-out",
          size === "md"
            ? "size-5 data-[checked]:translate-x-4"
            : "size-4 data-[checked]:translate-x-3",
        )}
      />
    </BaseSwitch.Root>
  );
  if (!label) return control;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-4 text-base text-fg",
        className,
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {description ? <span className="text-sm text-fg-muted">{description}</span> : null}
      </span>
      {control}
    </label>
  );
}
