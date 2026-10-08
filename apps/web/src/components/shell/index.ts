/**
 * App chrome shared by every page.
 *
 * - `KeyboardShortcuts` — mounted by the root route on every page: ⌘K / `/` palette, `?` shortcuts
 *   dialog, "g …" navigation from the registry in `lib/shortcuts.ts`.
 * - `AppShell` — signed-in layout (TopBar). Used by the `_app` route, so pages under `/_app/*`
 *   already render inside it: don't add another TopBar.
 * - `SiteHeader` — public header for the landing page and docs (Sign in / Get started, or
 *   "Open library" when signed in).
 * - `useCommandPalette()` — `openPalette(query?)` from any page; `useShowShortcuts()` opens the
 *   shortcuts dialog.
 * - `PlatformSwitch`, `AccountMenu`, `AppTopBar` — the pieces, if a page needs one on its own.
 */
export { AccountMenu, type AccountMenuProps } from "./account-menu";
export { AppShell } from "./app-shell";
export { AppTopBar, type AppTopBarProps } from "./app-top-bar";
export { CommandPaletteProvider, useCommandPalette } from "./command-palette";
export { DeferredToaster } from "./deferred-toaster";
export { KeyboardShortcuts, useShowShortcuts } from "./keyboard-shortcuts";
export { PlatformSwitch } from "./platform-switch";
export { SiteHeader, type SiteHeaderProps } from "./site-header";
