import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { cn } from "../lib/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "ou-focus-ring relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium " +
  "transition-[background-color,color,border-color,opacity,transform] duration-150 ease-out " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-inverse text-inverse-fg hover:bg-inverse/85",
  secondary: "bg-muted text-fg hover:bg-muted-strong",
  outline: "border border-border-strong bg-bg text-fg hover:bg-muted",
  ghost: "text-fg hover:bg-muted data-[popup-open]:bg-muted",
  danger: "bg-danger text-white hover:bg-danger/90",
  link: "h-auto px-0 text-fg underline decoration-border-strong underline-offset-4 hover:decoration-current active:scale-100",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-sm [&_svg]:size-4",
  md: "h-9 px-4 text-base [&_svg]:size-4",
  lg: "h-11 px-5 text-md [&_svg]:size-[18px]",
};

const iconSizes: Record<ButtonSize, string> = {
  sm: "size-8 [&_svg]:size-4",
  md: "size-9 [&_svg]:size-[18px]",
  lg: "size-11 [&_svg]:size-5",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square icon-only button. Always pass `aria-label`. */
  icon?: boolean;
  /** `pill` (default, 999px) or `rounded` (10px control radius). */
  shape?: "pill" | "rounded";
  className?: string;
}

/** Class string for button-looking elements you render yourself (e.g. a router `<Link>`). */
export function buttonClassName({
  variant = "primary",
  size = "md",
  icon = false,
  shape = "pill",
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    base,
    variants[variant],
    variant === "link" ? "" : icon ? iconSizes[size] : sizes[size],
    shape === "pill" ? "rounded-pill" : "rounded-control",
    className,
  );
}

export interface ButtonProps
  extends useRender.ComponentProps<"button">, Omit<ButtonStyleOptions, "className"> {
  /** Shows a spinner, sets `aria-busy` and disables the button. */
  loading?: boolean;
}

/**
 * Pill button. Primary = black pill (white in dark mode).
 *
 * Render as a link with `render`: `<Button render={<Link to="/contribute" />}>Contribute</Button>`.
 */
export function Button({
  variant,
  size,
  icon,
  shape,
  loading = false,
  disabled,
  className,
  render,
  children,
  ref,
  ...props
}: ButtonProps) {
  const isNativeButton = render === undefined;
  return useRender({
    defaultTagName: "button",
    render,
    ref,
    props: mergeProps<"button">(
      {
        className: buttonClassName({ variant, size, icon, shape, className }),
        type: isNativeButton ? "button" : undefined,
        disabled: isNativeButton ? disabled || loading : undefined,
        "aria-disabled": !isNativeButton && (disabled || loading) ? true : undefined,
        "aria-busy": loading || undefined,
        children: loading ? (
          <>
            <Spinner size={size === "lg" ? 18 : 16} />
            {icon ? null : children}
          </>
        ) : (
          children
        ),
      },
      props,
    ),
  });
}
