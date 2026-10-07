import { Check, Copy } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";

export interface CopyButtonProps extends Omit<React.ComponentProps<"button">, "onCopy"> {
  /** Text to copy. */
  value: string;
  label?: string;
  onCopied?: () => void;
}

/** Icon button that copies `value` and shows a check for 1.5s. */
export function CopyButton({ value, label = "Copy", onCopied, className, ...props }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          onCopied?.();
        } catch {
          // clipboard blocked; leave state unchanged
        }
      }}
      className={cn(
        "ou-focus-ring flex size-8 items-center justify-center rounded-[8px] text-fg-muted transition-colors duration-150 hover:bg-muted-strong hover:text-fg",
        className,
      )}
      {...props}
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
    </button>
  );
}

export interface CodeBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  code: string;
  /** Small label at the top-left, e.g. a filename or "Terminal". */
  title?: string;
  /** Show the copy button. Default true. */
  copyable?: boolean;
}

/**
 * Monospace snippet on the grey tile with a copy button (settings: API key, MCP config; docs).
 * No syntax highlighting by design — quiet and dependency-free.
 */
export function CodeBlock({ code, title, copyable = true, className, ...props }: CodeBlockProps) {
  return (
    <div className={cn("group relative overflow-hidden rounded-card bg-tile", className)} {...props}>
      {title ? (
        <div className="flex h-10 items-center border-b border-border px-4 text-sm font-medium text-fg-muted">
          {title}
        </div>
      ) : null}
      <pre className="ou-scrollbar-thin overflow-x-auto px-4 py-3.5 pr-12 font-mono text-[13px] leading-[21px] text-fg">
        <code>{code}</code>
      </pre>
      {copyable ? (
        <CopyButton
          value={code}
          className={cn("absolute right-2", title ? "top-1" : "top-2")}
        />
      ) : null}
    </div>
  );
}
