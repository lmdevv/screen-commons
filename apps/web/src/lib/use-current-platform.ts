import { useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { isPlatform, recallPlatform, rememberPlatform, type Platform } from "./platform";

/**
 * The platform the library is showing: `/browse/$platform`, `/search?platform=`, else the last
 * one browsed (client only, so SSR renders "web" and the switch corrects itself after mount).
 */
export function useCurrentPlatform(): Platform {
  const params = useParams({ strict: false }) as { platform?: string };
  const search = useSearch({ strict: false }) as { platform?: string };
  const explicit = isPlatform(params.platform)
    ? params.platform
    : isPlatform(search.platform)
      ? search.platform
      : null;
  const [remembered, setRemembered] = useState<Platform>("web");
  useEffect(() => {
    if (explicit) rememberPlatform(explicit);
    else setRemembered(recallPlatform() ?? "web");
  }, [explicit]);
  return explicit ?? remembered;
}
