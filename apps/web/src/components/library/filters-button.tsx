import { Button, cn } from "@screen-commons/ui";
import { SlidersHorizontal } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import type { FiltersPanelProps } from "./filters-popover";

const loadPopover = () => import("./filters-popover");
const FiltersPopover = lazy(loadPopover);

/**
 * "Filters" button that turns into the filters popover on first use. The popover (Base UI
 * positioning engine) is a separate chunk so Discover's first load stays small.
 */
export function FiltersButton(props: FiltersPanelProps) {
  const [armed, setArmed] = useState(false);
  const active = props.activeCount;
  const placeholder = (
    <Button
      variant="secondary"
      className="h-9"
      aria-haspopup="dialog"
      onPointerEnter={() => void loadPopover()}
      onFocus={() => void loadPopover()}
      onClick={() => setArmed(true)}
    >
      <SlidersHorizontal />
      Filters
      <FilterCount count={active} />
    </Button>
  );
  if (!armed) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <FiltersPopover {...props} />
    </Suspense>
  );
}

export function FilterCount({ count }: { count: number }) {
  return (
    <span
      aria-label={count ? `${count} active` : undefined}
      className={cn(
        "-mr-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-inverse px-1.5 text-xs font-semibold text-inverse-fg tabular-nums",
        count === 0 && "hidden",
      )}
    >
      {count}
    </span>
  );
}
