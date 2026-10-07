const SEPARATORS = /\s+[|–—·•:-]\s+/u;

/**
 * Screen titles come from page <title>s ("Pricing | Linear", "Linear – Plan and build"). Next to
 * the app's own name that suffix/prefix is noise: drop the part that names the app.
 */
export function displayTitle(title: string | null, appName: string): string | null {
  if (!title) return title;
  const app = appName.toLowerCase();
  const parts = title.split(SEPARATORS);
  if (parts.length < 2) return title;
  const kept = parts.flatMap((part, index) => {
    const edge = index === 0 || index === parts.length - 1;
    const at = part.toLowerCase().indexOf(app);
    if (!edge || at === -1) return [part];
    // "Attio" → dropped; "Attio Changelog" → "Changelog".
    const rest = (part.slice(0, at) + part.slice(at + app.length)).trim();
    return rest ? [rest] : [];
  });
  const result = kept.join(" · ").trim();
  return result || title;
}

/** Same object with a cleaned `title` (identity kept when nothing changes). */
export function withDisplayTitle<T extends { title: string | null; app: { name: string } }>(
  screen: T,
): T {
  const title = displayTitle(screen.title, screen.app.name);
  return title === screen.title ? screen : { ...screen, title };
}
