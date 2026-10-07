/**
 * App chrome shared by every page.
 *
 * - `AppShell` — signed-in layout (TopBar + ⌘K palette + shortcuts). Used by the `_app` route, so
 *   pages under `/_app/*` already render inside it: don't add another TopBar.
 * - `SiteHeader` — public header for the landing page and docs (Sign in / Get started, or
 *   "Open library" when signed in).
 * - `useCommandPalette()` — `openPalette(query?)` from anywhere inside AppShell;
 *   `useOptionalCommandPalette()` returns null outside it.
 * - `PlatformSwitch`, `AccountMenu`, `AppTopBar` — the pieces, if a page needs one on its own.
 */
export { AccountMenu, type AccountMenuProps } from "./account-menu";
export { AppShell } from "./app-shell";
export { AppTopBar, type AppTopBarProps } from "./app-top-bar";
export {
  CommandPaletteProvider,
  useCommandPalette,
  useOptionalCommandPalette,
} from "./command-palette";
export { DeferredToaster } from "./deferred-toaster";
export { PlatformSwitch } from "./platform-switch";
export { SiteHeader, type SiteHeaderProps } from "./site-header";
