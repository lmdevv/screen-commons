import { unauthorized } from "../errors";
import { getPrincipal, type Principal } from "../principal";
import { isCrossOrigin } from "./cors";

/** Bearer key from any origin; the session cookie only counts for same-origin requests. */
export const requestPrincipal = (request: Request) =>
  getPrincipal(request, { allowCookies: !isCrossOrigin(request) });

export function requireUser(principal: Principal | null): Principal {
  if (!principal) throw unauthorized();
  return principal;
}
