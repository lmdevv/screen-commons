import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import type * as React from "react";

import { cn } from "../lib/cn";
import { initials } from "../lib/format";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const sizes: Record<AvatarSize, string> = {
  xs: "size-5 text-2xs",
  sm: "size-7 text-xs",
  md: "size-9 text-sm",
  lg: "size-14 text-lg",
};

export interface AvatarProps extends Omit<React.ComponentProps<typeof BaseAvatar.Root>, "children"> {
  /** Person or org name; used for alt text and the initials fallback. */
  name: string;
  src?: string | null;
  size?: AvatarSize;
}

/** Round avatar with image + initials fallback. */
export function Avatar({ name, src, size = "md", className, ...props }: AvatarProps) {
  return (
    <BaseAvatar.Root
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted-strong align-middle font-medium text-fg-muted",
        sizes[size],
        className,
      )}
      {...props}
    >
      {src ? (
        <BaseAvatar.Image src={src} alt={name} className="size-full object-cover" />
      ) : null}
      <BaseAvatar.Fallback delay={src ? 400 : 0} className="leading-none">
        {initials(name)}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  );
}
