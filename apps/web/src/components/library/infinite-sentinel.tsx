import { useEffect, useRef } from "react";

/**
 * Invisible marker after a grid: calls `onVisible` when it comes within ~1.5 screens of the
 * viewport, so the next page is usually ready before the user gets there.
 */
export function InfiniteSentinel({
  onVisible,
  disabled,
}: {
  onVisible: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { rootMargin: "0px 0px 1400px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [disabled]);
  return <div ref={ref} aria-hidden className="h-px" />;
}
