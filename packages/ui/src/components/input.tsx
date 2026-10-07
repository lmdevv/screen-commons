import { Input as BaseInput } from "@base-ui/react/input";
import * as React from "react";

import { cn } from "../lib/cn";

/**
 * Filled control style shared by Input, Textarea and Select triggers: quiet grey fill at rest,
 * white with an accent border + soft ring when focused.
 */
export const controlClassName =
  "w-full min-w-0 rounded-control border border-transparent bg-muted text-fg placeholder:text-fg-subtle " +
  "transition-[background-color,border-color,box-shadow] duration-150 ease-out " +
  "hover:bg-muted-strong/70 " +
  "focus:bg-bg focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] focus:outline-none " +
  "focus-visible:outline-none " +
  "aria-[invalid=true]:border-danger data-[invalid]:border-danger " +
  "disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

export type InputSize = "sm" | "md" | "lg";

const inputSizes: Record<InputSize, string> = {
  sm: "h-8 px-2.5 text-sm",
  md: "h-10 px-3 text-base pointer-coarse:text-md",
  lg: "h-12 px-4 text-md",
};

export interface InputProps extends Omit<React.ComponentProps<typeof BaseInput>, "size"> {
  size?: InputSize;
  /** Icon or element rendered inside the left edge (e.g. a search icon). */
  leading?: React.ReactNode;
  /** Element rendered inside the right edge (e.g. a Kbd hint or clear button). */
  trailing?: React.ReactNode;
}

/**
 * Text input. Works standalone or inside `<Field>` (label/description/error wiring is automatic).
 */
export function Input({ size = "md", leading, trailing, className, ...props }: InputProps) {
  const input = (
    <BaseInput
      className={cn(
        controlClassName,
        inputSizes[size],
        leading ? "pl-9" : undefined,
        trailing ? "pr-10" : undefined,
        leading || trailing ? undefined : className,
      )}
      {...props}
    />
  );
  if (!leading && !trailing) return input;
  return (
    <div className={cn("relative flex w-full items-center", className)}>
      {leading ? (
        <span className="pointer-events-none absolute left-3 flex text-fg-subtle [&_svg]:size-4">
          {leading}
        </span>
      ) : null}
      {input}
      {trailing ? <span className="absolute right-2 flex items-center">{trailing}</span> : null}
    </div>
  );
}

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  /** Grow with content up to `maxRows` (uses CSS `field-sizing` where supported). */
  autoResize?: boolean;
}

/** Multi-line text input. */
export function Textarea({ className, autoResize = true, rows = 4, ...props }: TextareaProps) {
  return (
    <BaseInput
      render={<textarea rows={rows} />}
      className={cn(
        controlClassName,
        "min-h-20 resize-y px-3 py-2.5 text-base leading-[22px] pointer-coarse:text-md",
        autoResize && "[field-sizing:content] max-h-80",
        className,
      )}
      {...(props as React.ComponentProps<typeof BaseInput>)}
    />
  );
}
