/*
 * The command and shortcut registry: every page command (⌘K palette, "g" shortcuts) and every
 * key the app binds, in one place. The palette lists `commandsFor(audience)`, the root binds
 * their `shortcut`s, the viewer/review/grid code binds `SHORTCUTS.*.keys`, and the `?` dialog and
 * docs/browsing.md render `helpSections(audience)`. Change a key here and every surface follows.
 *
 * Keys use the `@screen-commons/ui` notation ("mod+k", "g s", "?"). Navigation is "g then a
 * letter" — single letters without modifiers never collide with browser or OS shortcuts, and the
 * "g" prefix keeps plain letters free for page actions (S saves in the viewer, J/K in review).
 * ⌥⇧S/V/E belong to the browser extension; avoid Alt chords.
 */
import type { User } from "@screen-commons/core";
import { linkOptions, type NavigateOptions } from "@tanstack/react-router";

import type { Platform } from "./platform";

export type Audience = "signedOut" | "member" | "admin";

export function audienceOf(user: Pick<User, "role"> | null): Audience {
  if (!user) return "signedOut";
  return user.role === "admin" ? "admin" : "member";
}

const EVERYONE: readonly Audience[] = ["signedOut", "member", "admin"];
const SIGNED_IN: readonly Audience[] = ["member", "admin"];
const SIGNED_OUT: readonly Audience[] = ["signedOut"];
const ADMIN: readonly Audience[] = ["admin"];

export interface CommandContext {
  /** The platform the library is showing, kept by platform-specific destinations. */
  platform: Platform;
}

export type CommandGroup = "Go to" | "Browse" | "Settings";

export interface NavCommand {
  id: string;
  /** Palette row and help label. */
  label: string;
  group: CommandGroup;
  /** Extra words the palette matches. */
  keywords?: string;
  /** Sequence that runs the command from any page (no dialog open). */
  shortcut?: string;
  audience: readonly Audience[];
  to: (context: CommandContext) => NavigateOptions;
}

const browseTab = (tab: "apps" | "screens" | "elements" | "flows") => (context: CommandContext) =>
  linkOptions({
    to: "/browse/$platform",
    params: { platform: context.platform },
    search: tab === "apps" ? {} : { tab },
  });

/** Page commands, in palette order. */
export const NAV_COMMANDS: readonly NavCommand[] = [
  {
    id: "home",
    label: "Home",
    group: "Go to",
    keywords: "landing start",
    shortcut: "g h",
    audience: SIGNED_OUT,
    to: () => linkOptions({ to: "/" }),
  },
  {
    id: "discover",
    label: "Discover",
    group: "Go to",
    keywords: "home browse library apps",
    shortcut: "g h",
    audience: SIGNED_IN,
    to: browseTab("apps"),
  },
  {
    id: "saved",
    label: "Saved",
    group: "Go to",
    keywords: "collections bookmarks",
    shortcut: "g s",
    audience: SIGNED_IN,
    to: () => linkOptions({ to: "/saved" }),
  },
  {
    id: "contribute",
    label: "Contribute",
    group: "Go to",
    keywords: "upload add screens",
    shortcut: "g c",
    audience: SIGNED_IN,
    to: () => linkOptions({ to: "/contribute" }),
  },
  {
    id: "review",
    label: "Review queue",
    group: "Go to",
    keywords: "approve reject pending admin",
    shortcut: "g r",
    audience: ADMIN,
    to: () => linkOptions({ to: "/review" }),
  },
  {
    id: "settings",
    label: "Settings",
    group: "Go to",
    keywords: "profile account preferences",
    shortcut: "g ,",
    audience: SIGNED_IN,
    to: () => linkOptions({ to: "/settings" }),
  },
  {
    id: "docs",
    label: "Docs",
    group: "Go to",
    keywords: "documentation help guide",
    shortcut: "g d",
    audience: EVERYONE,
    to: () => linkOptions({ to: "/docs" }),
  },
  {
    id: "sign-in",
    label: "Sign in",
    group: "Go to",
    keywords: "log in login account",
    audience: SIGNED_OUT,
    to: () => linkOptions({ to: "/sign-in" }),
  },
  {
    id: "sign-up",
    label: "Create an account",
    group: "Go to",
    keywords: "sign up register get started",
    audience: SIGNED_OUT,
    to: () => linkOptions({ to: "/sign-up" }),
  },
  {
    id: "browse-apps",
    label: "Browse apps",
    group: "Browse",
    keywords: "discover categories",
    audience: SIGNED_IN,
    to: browseTab("apps"),
  },
  {
    id: "browse-screens",
    label: "Browse screens",
    group: "Browse",
    keywords: "discover patterns",
    audience: SIGNED_IN,
    to: browseTab("screens"),
  },
  {
    id: "browse-elements",
    label: "Browse UI elements",
    group: "Browse",
    keywords: "discover components",
    audience: SIGNED_IN,
    to: browseTab("elements"),
  },
  {
    id: "browse-flows",
    label: "Browse flows",
    group: "Browse",
    keywords: "discover journeys",
    audience: SIGNED_IN,
    to: browseTab("flows"),
  },
  {
    id: "settings-profile",
    label: "Profile",
    group: "Settings",
    keywords: "settings name avatar password",
    audience: SIGNED_IN,
    to: () => linkOptions({ to: "/settings" }),
  },
  {
    id: "settings-keys",
    label: "API keys",
    group: "Settings",
    keywords: "settings tokens",
    audience: SIGNED_IN,
    to: () => linkOptions({ to: "/settings", search: { tab: "keys" } }),
  },
  {
    id: "settings-integrations",
    label: "Extension & MCP",
    group: "Settings",
    keywords: "settings integrations agents",
    audience: SIGNED_IN,
    to: () => linkOptions({ to: "/settings", search: { tab: "integrations" } }),
  },
  {
    id: "extension-connect",
    label: "Connect the browser extension",
    group: "Settings",
    keywords: "extension capture api key",
    audience: SIGNED_IN,
    to: () => linkOptions({ to: "/extension/connect" }),
  },
];

/** The shortcut of a page command, for hints next to links and menu items. */
export function commandShortcut(id: string): string | undefined {
  return NAV_COMMANDS.find((command) => command.id === id)?.shortcut;
}

export function commandsFor(audience: Audience): NavCommand[] {
  return NAV_COMMANDS.filter((command) => command.audience.includes(audience));
}

/** Case-insensitive match of every query word against the label, group and keywords. */
export function matchesCommand(
  command: { label: string; group?: string; keywords?: string },
  query: string,
): boolean {
  const haystack =
    `${command.label} ${command.group ?? ""} ${command.keywords ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export interface ShortcutEntry {
  /** Bound keys (ui notation), or display-only keys for behaviour owned by a widget. */
  keys: string;
  label: string;
  /** Alternative keys with the same effect, shown alongside `keys`. */
  also?: readonly string[];
  /** Keys a widget (dialog, dnd-kit, native focus) handles, listed for help only. */
  native?: boolean;
}

/** Every non-navigation key the app binds or documents, by context. */
export const SHORTCUTS = {
  palette: { keys: "mod+k", label: "Search and commands" },
  search: { keys: "/", label: "Search" },
  help: { keys: "?", label: "Keyboard shortcuts" },
  close: { keys: "escape", label: "Close a dialog, menu or viewer", native: true },

  tileNext: { keys: "tab", label: "Move between tiles and controls", native: true },
  tileOpen: { keys: "enter", label: "Open the focused tile", native: true },
  tileSelect: { keys: "space", label: "Select the focused tile’s checkbox", native: true },
  clearSelection: { keys: "escape", label: "Clear the selection" },

  viewerPrevious: { keys: "arrowleft", label: "Previous screen" },
  viewerNext: { keys: "arrowright", label: "Next screen" },
  viewerSave: { keys: "s", label: "Save or unsave" },
  viewerCopy: { keys: "mod+c", label: "Copy image" },
  viewerZoom: { keys: "z", label: "Toggle fit / actual width" },

  reviewNext: { keys: "j", label: "Next item" },
  reviewPrevious: { keys: "k", label: "Previous item" },
  reviewApprove: { keys: "a", label: "Approve" },
  reviewReject: { keys: "r", label: "Reject (type a reason, Enter to confirm)" },

  reorderPickUp: {
    keys: "space",
    label: "Pick up or drop a screen (focus its handle)",
    native: true,
  },
  reorderMove: {
    keys: "arrowup",
    also: ["arrowdown", "arrowleft", "arrowright"],
    label: "Move it",
    native: true,
  },
  reorderCancel: { keys: "escape", label: "Cancel the move", native: true },
} as const satisfies Record<string, ShortcutEntry>;

export interface HelpSection {
  title: string;
  items: ShortcutEntry[];
}

/** The `?` dialog's content for an audience (and the shortcut table in docs/browsing.md). */
export function helpSections(audience: Audience): HelpSection[] {
  const s = SHORTCUTS;
  const sections: HelpSection[] = [
    { title: "Anywhere", items: [s.palette, s.search, s.help, s.close] },
    {
      title: "Go to",
      items: commandsFor(audience)
        .filter((command) => command.shortcut)
        .map((command) => ({ keys: command.shortcut!, label: command.label })),
    },
  ];
  if (audience === "signedOut") return sections;
  sections.push(
    {
      title: "Grids",
      items: [s.tileNext, s.tileOpen, s.tileSelect, s.clearSelection],
    },
    {
      title: "Screen viewer",
      items: [s.viewerPrevious, s.viewerNext, s.viewerSave, s.viewerCopy, s.viewerZoom],
    },
    { title: "Contribute", items: [s.reorderPickUp, s.reorderMove, s.reorderCancel] },
  );
  if (audience === "admin") {
    sections.push({
      title: "Review",
      items: [s.reviewNext, s.reviewPrevious, s.reviewApprove, s.reviewReject],
    });
  }
  return sections;
}
