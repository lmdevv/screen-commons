/** Only allow same-site relative redirects (`/x`, never `//evil.com` or absolute URLs). */
export function safeRedirect(target: string | undefined): string {
  return target && target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\")
    ? target
    : "/browse/web";
}
