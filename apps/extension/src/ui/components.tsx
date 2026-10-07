import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { forwardRef, useId } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:opacity-85 disabled:opacity-40",
  secondary: "border border-line bg-bg text-fg hover:bg-hover disabled:opacity-50",
  ghost: "text-fg hover:bg-hover disabled:opacity-40",
  danger: "text-danger hover:bg-hover disabled:opacity-40",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-[12px] gap-1.5",
  md: "h-8 px-3.5 text-ui gap-2",
  lg: "h-9 px-4 text-ui gap-2",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium whitespace-nowrap transition-[opacity,background-color] duration-150",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-hover hover:text-fg disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const fieldBase =
  "h-8 w-full rounded-lg border border-line bg-field px-2.5 text-ui text-fg placeholder:text-subtle transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--ou-fg)_22%,transparent)] focus:border-[color-mix(in_srgb,var(--ou-fg)_45%,transparent)] focus:outline-none disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cx(fieldBase, className)} {...props} />;
  },
);

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(fieldBase, "appearance-none pr-8", className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted"
      >
        <path
          d="M4.5 6.5 8 10l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
  aside,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-[12px] font-medium text-muted">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint ? <p className="text-[12px] leading-4 text-subtle">{hint}</p> : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-40",
        checked ? "bg-primary" : "bg-[color-mix(in_srgb,var(--ou-fg)_16%,transparent)]",
      )}
    >
      <span
        className={cx(
          "inline-block size-3.5 rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-150",
          checked
            ? "translate-x-[14px] bg-primary-fg"
            : "translate-x-[2px] bg-white dark:bg-[#a1a1aa]",
        )}
      />
    </button>
  );
}

export type DotTone = "ok" | "warn" | "danger" | "idle" | "busy";

export function Dot({ tone }: { tone: DotTone }) {
  const color = {
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    idle: "bg-subtle",
    busy: "bg-warn animate-pulse",
  }[tone];
  return <span aria-hidden className={cx("inline-block size-1.5 shrink-0 rounded-full", color)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-sans text-[11px] font-medium tracking-wide tabular-nums opacity-55">
      {children}
    </kbd>
  );
}

export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" className="fill-fg" />
      <rect
        x="8"
        y="8"
        width="16"
        height="16"
        rx="4.5"
        fill="none"
        strokeWidth="3"
        className="stroke-bg"
      />
    </svg>
  );
}

export function Chip({
  children,
  onRemove,
  label,
}: {
  children: ReactNode;
  onRemove?: () => void;
  label?: string;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-bg pr-1 pl-2.5 text-[12px] font-medium text-fg">
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={label ? `Remove ${label}` : "Remove"}
          className="inline-flex size-4 items-center justify-center rounded-full text-subtle hover:bg-hover hover:text-fg"
        >
          <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
            <path
              d="m4.5 4.5 7 7m0-7-7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : (
        <span className="w-1.5" />
      )}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cx("size-3.5 animate-spin", className)} aria-hidden>
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function useFieldId(prefix: string) {
  return `${prefix}-${useId().replace(/:/gu, "")}`;
}
