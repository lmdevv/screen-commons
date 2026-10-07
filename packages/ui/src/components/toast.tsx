import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type * as React from "react";
import { Toaster as Sonner, toast } from "sonner";

import { Spinner } from "./spinner";
import { useOptionalTheme } from "./theme";

export { toast };

export interface ToasterProps extends Omit<
  React.ComponentProps<typeof Sonner>,
  "theme" | "toastOptions" | "icons"
> {}

/**
 * Mount once near the root (inside ThemeProvider). Then call `toast("Saved to collection")`,
 * `toast.success(…)`, `toast.error(…)`, `toast.promise(…)` anywhere.
 * Toasts are dark chrome pills at the bottom centre, matching the SelectionBar.
 */
export function Toaster({ position = "bottom-center", ...props }: ToasterProps) {
  const theme = useOptionalTheme();
  return (
    <Sonner
      theme={theme?.resolvedTheme ?? "system"}
      position={position}
      gap={8}
      offset={24}
      visibleToasts={3}
      icons={{
        success: <CircleCheck className="size-4 text-success" aria-hidden />,
        error: <CircleAlert className="size-4 text-danger" aria-hidden />,
        warning: <TriangleAlert className="size-4 text-warning" aria-hidden />,
        info: <Info className="size-4" aria-hidden />,
        loading: <Spinner />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group flex w-full items-center gap-2.5 rounded-[14px] bg-chrome px-4 py-3 text-base text-chrome-fg shadow-overlay sm:w-auto sm:min-w-[340px] sm:max-w-[440px]",
          title: "font-medium",
          description: "text-sm text-chrome-muted",
          icon: "flex shrink-0 [&_svg]:text-current",
          actionButton:
            "ml-auto shrink-0 rounded-pill bg-white px-3 py-1 text-sm font-medium text-black transition-opacity hover:opacity-90",
          cancelButton:
            "shrink-0 rounded-pill px-3 py-1 text-sm font-medium text-chrome-muted hover:text-chrome-fg",
          closeButton: "!bg-chrome !border-white/10 !text-chrome-fg",
        },
      }}
      {...props}
    />
  );
}
