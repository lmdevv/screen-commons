import { queryOptions } from "@tanstack/react-query";

import { getAuthPageInfo } from "../auth/auth.functions";
import { getLandingData } from "./landing.functions";

/** Public catalog sample (landing hero grid, auth collage). */
export const landingQuery = () =>
  queryOptions({ queryKey: ["landing"], queryFn: () => getLandingData(), staleTime: 60_000 });

/** GitHub availability + "first account becomes admin". */
export const authPageInfoQuery = () =>
  queryOptions({ queryKey: ["auth-page-info"], queryFn: () => getAuthPageInfo(), staleTime: 0 });
