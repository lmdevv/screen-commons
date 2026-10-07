import * as React from "react";

/** Tiny hash router for the showcase: `#/app?screen=id`. */
export interface Route {
  path: string;
  params: URLSearchParams;
}

function read(): Route {
  const raw = window.location.hash.replace(/^#/u, "") || "/components";
  const [path = "/components", query = ""] = raw.split("?");
  return { path, params: new URLSearchParams(query) };
}

export function useRoute(): Route {
  const [route, setRoute] = React.useState(read);
  React.useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function href(path: string, params?: Record<string, string | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) if (value) query.set(key, value);
  const qs = query.toString();
  return `#${path}${qs ? `?${qs}` : ""}`;
}

export function navigate(path: string, params?: Record<string, string | null | undefined>): void {
  window.location.hash = href(path, params).slice(1);
}

/** Update query params on the current path (keeps others). */
export function setParams(route: Route, next: Record<string, string | null | undefined>): void {
  const merged: Record<string, string | null | undefined> = Object.fromEntries(route.params);
  Object.assign(merged, next);
  navigate(route.path, merged);
}
