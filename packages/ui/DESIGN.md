# Open UI design system (`@open-ui/ui`)

Open UI is a library of screenshots. The interface exists to frame them: **quiet chrome, loud
content**. This document is the contract for building the website (and the extension pages)
from this package. Follow it literally; when something is missing, extend the package rather than
styling one-offs in the app.

- Showcase (every component + composed pages): `pnpm --filter @open-ui/ui showcase` → <http://localhost:5179>
- Visual check: `pnpm --filter @open-ui/ui showcase:shoot [name…]` → `showcase/.screenshots/*.png`
- Tests: `pnpm --filter @open-ui/ui test` · types: `check-types` · lint: `lint`

---

## 1. Principles

1. **Content first.** Screenshots sit on soft grey tiles; everything else is black, white and
   grey. No gradients, glows, emoji, illustrations or decorative colour.
2. **One accent, used sparingly.** Blue (`accent`) is reserved for focus rings, selection and
   links in running text. Primary actions are **black pills** (white in dark mode).
3. **Calm density.** Few borders (hairlines only), almost no shadows (one soft elevation for
   floating surfaces), generous gaps between tiles, tight headings.
4. **Fast by construction.** Thumbnails only in grids, explicit `width`/`height`, lazy images,
   uniform frames → zero layout shift. No JS for things CSS can do.
5. **Motion explains, never decorates.** 120–180 ms, ease-out, opacity/transform only.
   `prefers-reduced-motion` disables movement globally.
6. **Accessible by default.** Every interactive element is a real button/link with a visible
   focus ring; icon-only buttons have `aria-label`; overlays trap and restore focus; text meets
   WCAG AA in both themes (checked: secondary text ≥ 5.2:1, placeholders ≥ 4.7:1, control
   borders ≥ 3:1).

---

## 2. Setup in an app (TanStack Start)

```css
/* apps/web/src/styles.css — the ONLY Tailwind entry. Do not also `@import "tailwindcss"`. */
@import "@open-ui/ui/styles.css";
/* Tailwind auto-detects the app's own files; the package's classes are covered by its @source. */
```

```tsx
// apps/web/src/routes/__root.tsx
import { themeScript, ThemeProvider, TooltipProvider, Toaster } from "@open-ui/ui";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: "stylesheet", href: appCss }],
    scripts: [{ children: themeScript }], // runs before paint → no theme flash
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <Outlet />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  ),
});
```

Imports: `import { Button, ScreenTile } from "@open-ui/ui"` (tree-shakable, source-exported), or
deep imports `@open-ui/ui/components/screen-tile`, `@open-ui/ui/lib/cn`.

**Router links.** Every navigable component takes a `render` / `linkRender` element instead of an
`href`, so TanStack `<Link>` keeps type-safe params:

```tsx
<Button render={<Link to="/contribute" />}>Contribute</Button>
<TabNavItem active={tab === "apps"} render={<Link to="/browse/$platform" params={{ platform }} search={{ tab: "apps" }} />}>Apps</TabNavItem>
<ScreenTile screen={s} linkRender={<Link to="." search={(p) => ({ ...p, screen: s.id })} />} />
<AppCard app={a} linkRender={<Link to="/apps/$slug" params={{ slug: a.slug }} />} />
```

---

## 3. Tokens

All tokens are CSS variables (`--ou-*`) exposed as Tailwind utilities. Components use **semantic
utilities only** and never `dark:` — the `.dark` class (or the OS preference before JS) swaps the
variables. App code should do the same; `dark:` exists only as an escape hatch.

### Colour

| Utility                                  | Light                 | Dark                  | Use                                                  |
| ---------------------------------------- | --------------------- | --------------------- | ---------------------------------------------------- |
| `bg-bg`                                  | `#ffffff`             | `#0b0b0c`             | Page                                                 |
| `text-fg`                                | `#0a0a0a`             | `#f2f2f3`             | Primary text, icons                                  |
| `text-fg-muted`                          | `#66666c`             | `#9d9da4`             | Secondary text, inactive tabs, labels                |
| `text-fg-subtle`                         | `#6c6c72`             | `#8a8a91`             | Placeholders, meta, separators ("on", "/")           |
| `text-fg-faint`                          | `#b4b4b9`             | `#48484d`             | Disabled / decorative only — never content           |
| `bg-tile` / `bg-tile-hover`              | `#f4f4f5`             | `#161618`             | Screenshot tiles, code blocks, neutral callouts      |
| `bg-surface`                             | `#ffffff`             | `#111113`             | Dialogs, cards                                       |
| `bg-elevated`                            | `#ffffff`             | `#18181b`             | Menus, popovers, floating buttons on images          |
| `bg-muted` / `bg-muted-strong`           | `#f4f4f5` / `#e9e9eb` | `#1a1a1d` / `#252529` | Filled controls, hover backgrounds                   |
| `border-border`                          | `#ececee`             | `#1f1f23`             | Hairlines, idle chips                                |
| `border-border-strong`                   | `#dcdce0`             | `#2e2e33`             | Outline buttons, dividers that must be seen          |
| `border-control-border`                  | `#929298`             | `#66666e`             | Checkbox outline, switch track (≥ 3:1)               |
| `bg-inverse` / `text-inverse-fg`         | black/white           | white/black           | Primary button, selected chip, step numbers          |
| `bg-chrome` / `text-chrome-fg`           | `#1d1d20`             | `#232327`             | Tooltips, toasts, SelectionBar (dark in both themes) |
| `accent` (+ `accent-soft`)               | `#2f5cf5`             | `#7896ff`             | Focus ring, selection ring, drag-over, links         |
| `success` `warning` `danger` (+ `-soft`) | —                     | —                     | Status badges, validation, destructive actions       |
| `bg-scrim`                               | 36% black             | 62% black             | Overlay backdrops                                    |

`shadow-overlay` (menus, dialogs, floating buttons) and `shadow-raised` (segmented thumb, chips
on images) are the only shadows. Don't add others.

### Type — Inter Variable (optical sizes), self-hosted, `font-display: swap`

The scale **replaces** Tailwind's defaults (`text-sm` is 13px here):

| Class       | Size / line | Tracking | Use                                               |
| ----------- | ----------- | -------- | ------------------------------------------------- |
| `text-3xl`  | 56 / 58     | −0.036em | Landing hero only                                 |
| `text-2xl`  | 40 / 44     | −0.03em  | Page titles ("Discover"), app name in AppHeader   |
| `text-xl`   | 28 / 34     | −0.022em | Mobile page titles, big stats                     |
| `text-lg`   | 20 / 26     | −0.014em | Section titles, dialog titles                     |
| `text-md`   | 16 / 24     | −0.006em | Lead paragraphs, meta values, palette input       |
| `text-base` | 14 / 20     | 0        | **Default UI text**: buttons, inputs, tabs, menus |
| `text-sm`   | 13 / 18     | 0        | Secondary text, captions, labels, counts          |
| `text-xs`   | 12 / 16     | 0        | Badges, kbd                                       |
| `text-2xs`  | 11 / 14     | 0        | Kbd glyphs only                                   |

Weights: 400 body, 500 (`font-medium`) for controls/labels, 600 (`font-semibold`) for headings and
names. Never 700+. Numbers that change or align use `tabular-nums`.

### Radius

`rounded-shot` 8 (inset screenshots, thumbs) · `rounded-control` 10 (inputs) · `rounded-card` 14
(cards, menus) · `rounded-tile` 20 (screenshot tiles, dialogs, overlays) · `rounded-pill` (buttons,
chips, segmented, search). Phone screenshots scale their radius with width (≈10% of width).

### Spacing rhythm (4px grid)

- Page gutters: `px-4` mobile · `px-6` ≥640 · `px-8` ≥1024 (use `<Container>`). Library pages are
  full width up to 1760px.
- Top bar 56px (`h-topbar`), sticky, translucent + blur, hairline appears on scroll.
- Page top padding below top bar: `pt-10 sm:pt-12`. Bottom: `pb-24`.
- Title → tabs `mt-5`; tabs → chip row `mt-6`; chip row → toolbar `mt-8`; toolbar → grid `mb-6`.
- Grid gaps: `gap-x-4 sm:gap-x-5 lg:gap-x-6`, `gap-y-6 lg:gap-y-8` (built into `ScreenGrid`).
- Between page sections: `mt-16`. Inside cards: `p-5`. Dialog: `px-6`, `pt-6`, `pb-6`.

### Motion

`duration-120` (hover), `duration-150` (default; `--default-transition-duration`),
`duration-180` (overlays, sliding indicators). Easing `ease-out` = `cubic-bezier(.2,.8,.2,1)`.
Base UI overlays animate via `data-[starting-style]` / `data-[ending-style]`. Theme switches
disable transitions for one frame.

### Layout grid (`ScreenGrid` recipes)

| Recipe        | Columns (base → sm → md → lg → xl → 2xl) | Content                             |
| ------------- | ---------------------------------------- | ----------------------------------- |
| `web`         | 1 → 2 → 2 → 3 → 3 → 4                    | Web screen tiles                    |
| `mobile`      | 2 → 3 → 4 → 5 → 5 → 6                    | Phone screen tiles                  |
| `apps-web`    | 1 → 2 → 2 → 3 → 3 → 4                    | AppCards (web)                      |
| `apps-mobile` | 2 → 3 → 3 → 4 → 5 → 5                    | AppCards (iOS/Android), collections |
| `flows`       | 1 → 1 → 2 → 2 → 2 → 3                    | FlowCards                           |

Frames: web 16:10, phones 9:19.5, always top-anchored. Short/wide captures are shown whole
(letterboxed at the top), tall ones are cropped at the bottom (`lib/screen.ts → screenFrame`).

---

## 4. Component inventory

Everything below is exported from `@open-ui/ui`. Props are typed against `@open-ui/core`
entities; components never fetch.

### Primitives

| Component                                                                                                                                                                                                                                                                                                                  | Notes / snippet                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`, `buttonClassName()`                                                                                                                                                                                                                                                                                              | `variant` primary·secondary·outline·ghost·danger·link, `size` sm·md·lg, `icon` (square, needs `aria-label`), `loading`, `shape` pill·rounded, `render` for links. `<Button variant="outline" icon aria-label="More"><Ellipsis /></Button>` |
| `Input`, `Textarea`                                                                                                                                                                                                                                                                                                        | Filled; `leading`/`trailing` slots; `size` sm·md·lg. Inside `Field` they wire to label/description/error automatically.                                                                                                                    |
| `Field`, `Label`, `Description`, `FieldError`, `Fieldset`, `Legend`, `Optional`                                                                                                                                                                                                                                            | `<Field invalid><Label>Website</Label><Input /><FieldError match>Enter a URL</FieldError></Field>`                                                                                                                                         |
| `Select`                                                                                                                                                                                                                                                                                                                   | Custom listbox. `variant` filled (forms) · pill (toolbar) · ghost ("Latest ▾", "Oct 2026 ▾"). `options=[{value,label}]`. Costs the popup engine (see §6).                                                                                  |
| `NativeSelect`                                                                                                                                                                                                                                                                                                             | Same variants on a native `<select>`, zero JS. **Use for toolbar sort/version on Discover/App pages.**                                                                                                                                     |
| `Checkbox`, `Switch`                                                                                                                                                                                                                                                                                                       | Optional `label` + `description`. Checkbox supports `indeterminate`.                                                                                                                                                                       |
| `SegmentedControl`                                                                                                                                                                                                                                                                                                         | Radio-group semantics; ←/→ move+select. Platform switch: `options={PLATFORMS…}` `aria-label="Platform"`.                                                                                                                                   |
| `SearchPill`                                                                                                                                                                                                                                                                                                               | Button (not input) that opens the palette; shows ⌘K/Ctrl K.                                                                                                                                                                                |
| `Kbd`, `KbdGroup`                                                                                                                                                                                                                                                                                                          | `<KbdGroup><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>`; `tone="chrome"` on dark bars.                                                                                                                                                             |
| `Chip`                                                                                                                                                                                                                                                                                                                     | Static/link tag: `tone` outline·soft·solid, `onRemove`, `render`.                                                                                                                                                                          |
| `FilterChip`                                                                                                                                                                                                                                                                                                               | Toggle pill (`aria-pressed`); selected = black. Optional `count`.                                                                                                                                                                          |
| `Tabs` `TabsList` `Tab` `TabsPanel`                                                                                                                                                                                                                                                                                        | Panel tabs with sliding underline (client state).                                                                                                                                                                                          |
| `TabNav` `TabNavItem`                                                                                                                                                                                                                                                                                                      | **Route tabs** (Apps · Screens · UI Elements · Flows). `active`, `badge`, `render`.                                                                                                                                                        |
| `Dialog` + `DialogContent` (`size` sm·md·lg·xl) `DialogHeader/Title/Description/Body/Footer`, `DialogTrigger`, `DialogClose`, `CloseButton`                                                                                                                                                                                | Centered; bottom-aligned on mobile.                                                                                                                                                                                                        |
| `Sheet` + `SheetContent` (`side` right·left·bottom)                                                                                                                                                                                                                                                                        | Mobile filters, mobile nav.                                                                                                                                                                                                                |
| `Lightbox` `LightboxHeader` `LightboxTitle` `LightboxBody` `LightboxFooter`                                                                                                                                                                                                                                                | Full-viewport overlay shell; ←/→ via `onPrev`/`onNext` (`null` = disabled arrow), `aside` panel, `resetKey`.                                                                                                                               |
| `DropdownMenu` `DropdownMenuTrigger` `DropdownMenuContent` `DropdownMenuItem` (`icon`, `hint`, `external`, `destructive`) `DropdownMenuLinkItem` `DropdownMenuCheckboxItem` `DropdownMenuRadioGroup/RadioItem` `DropdownMenuLabel` `DropdownMenuGroup` `DropdownMenuSeparator` `DropdownMenuHeader` `DropdownMenuThemeRow` | Trigger with `render={<Button … />}`.                                                                                                                                                                                                      |
| `Popover` `PopoverTrigger` `PopoverContent` `PopoverTitle` `PopoverDescription`                                                                                                                                                                                                                                            | Filters panel on desktop, "How search works".                                                                                                                                                                                              |
| `Tooltip`, `TooltipProvider`                                                                                                                                                                                                                                                                                               | Lightweight (no positioning engine): `side` top·bottom, `align` start·center·end (use `end` near the right edge). `<Tooltip content="Saved" shortcut="S"><TopBarIconButton aria-label="Saved">…`                                           |
| `Toaster`, `toast`                                                                                                                                                                                                                                                                                                         | Dark pills bottom-centre. `toast("Saved")`, `toast.success`, `toast.error`, `toast.promise`.                                                                                                                                               |
| `Avatar`                                                                                                                                                                                                                                                                                                                   | Image + initials fallback; xs·sm·md·lg.                                                                                                                                                                                                    |
| `Badge`, `StatusBadge`                                                                                                                                                                                                                                                                                                     | `tone` neutral·inverse·accent·success·warning·danger·glass (on images). `StatusBadge status="pending"`.                                                                                                                                    |
| `Skeleton`, `Spinner`, `Progress`                                                                                                                                                                                                                                                                                          | Skeletons must mirror real geometry (`ScreenGridSkeleton`).                                                                                                                                                                                |
| `EmptyState`                                                                                                                                                                                                                                                                                                               | `icon` (lucide), `title`, `description`, `actions`, `tone="tile"` inside grids.                                                                                                                                                            |
| `Callout`                                                                                                                                                                                                                                                                                                                  | Inline notice bar; tones neutral·accent·warning·danger·success.                                                                                                                                                                            |
| `Card` (+ Header/Title/Description/Content/Footer)                                                                                                                                                                                                                                                                         | Settings panels. `tone="tile"` for grey.                                                                                                                                                                                                   |
| `Separator`, `ScrollArea`, `VisuallyHidden`, `Container`, `Prose`, `TextLink`, `textLinkClassName`                                                                                                                                                                                                                         | `Prose` styles rendered markdown (docs).                                                                                                                                                                                                   |
| `CommandPalette` `CommandGroup` `CommandItem` (`icon`, `hint`, `shortcut`) `CommandSeparator` `CommandRailItem`                                                                                                                                                                                                            | cmdk inside a Base UI dialog. `shouldFilter={false}` for server results, `loading`, `emptyText`, `rail`.                                                                                                                                   |
| `CodeBlock`, `CopyButton`                                                                                                                                                                                                                                                                                                  | Snippets (API key, MCP config).                                                                                                                                                                                                            |
| `Table` `TableHead` `TableBody` `TableRow` `TableHeaderCell` `TableCell`                                                                                                                                                                                                                                                   | Hairline rows; API keys, review list view.                                                                                                                                                                                                 |
| `Steps`                                                                                                                                                                                                                                                                                                                    | Wizard progress.                                                                                                                                                                                                                           |
| `Logo`, `LogoMark`                                                                                                                                                                                                                                                                                                         | `variant` full·mark, `size` sm·md·lg.                                                                                                                                                                                                      |
| `ThemeProvider`, `useTheme`, `ThemeToggle`, `themeScript`, `createThemeScript`                                                                                                                                                                                                                                             | Class strategy, `localStorage["open-ui-theme"]`.                                                                                                                                                                                           |

### Library (domain) components

| Component                                                      | Takes                                                        | Notes                                                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TopBar`, `TopBarIconButton`, `AccountMenu`                    | `logo`, `nav`, `onSearchClick`, `actions`, `account`         | Platform switch in `nav` is hidden below `sm` — repeat it in the page header on mobile. `AccountMenu` renders a plain avatar button and lazy-loads the menu on first hover/focus/press. |
| `PageHeader`, `SectionHeader`, `Toolbar`, `ResultCount`        | strings/nodes                                                | `PageHeader` = 40px title; `ResultCount count noun`.                                                                                                                                    |
| `CategoryChips`                                                | `items`, `value` (`null` = All), `onValueChange`, `leading`  | Scroll row with fade edges + arrows.                                                                                                                                                    |
| `ScreenGrid`, `ScreenGridItem`, `ScreenGridSkeleton`           | `platform` or `columns`                                      | See recipes above.                                                                                                                                                                      |
| `ScreenTile`                                                   | `screen: ScreenTileData` (⊂ `Screen`)                        | `linkRender`/`onOpen`, `showApp` (cross-app grids), `onSaveToggle`, `selectable/selected/onSelectedChange`, `priority` (first row), `variant` tile·bare, `badge`, `caption`.            |
| `ScreenImage`                                                  | `src,width,height,platform,alt`                              | Low-level framed screenshot (`layout` frame·natural).                                                                                                                                   |
| `AppLogo`                                                      | `app` (`name`, `logoUrl?`, `accentColor?`)                   | xs 20 · sm 28 · md 36 · lg 48 · xl 80.                                                                                                                                                  |
| `AppCard`                                                      | `app: AppCardData` (⊂ `AppSummary`)                          | Tile with `previews[0]`, logo/name/tagline; `saved` + `onSaveToggle`; `badge`.                                                                                                          |
| `AppHeader`                                                    | `app` (⊂ `AppSummary`/`AppDetail`)                           | `back`, `actions`, `meta`, `renderCategory`.                                                                                                                                            |
| `FlowCard`                                                     | `flow: FlowCardData` (⊂ `FlowSummary`)                       | "Onboarding on [logo] App · 5 screens"; `hideApp` on app pages.                                                                                                                         |
| `FlowStrip`                                                    | `steps` (⊂ `FlowStep[]`)                                     | Scroll-snap strip, numbers + labels, `activeIndex`, `onStepClick`, `size` md·lg.                                                                                                        |
| `FlowViewer`                                                   | `flow` (⊂ `FlowDetail`)                                      | Lightbox: title, strip, Save/Copy/Download, device + size.                                                                                                                              |
| `ScreenViewer`, `ScreenDetails`                                | `screen` (⊂ `Screen` + `ScreenDetail` neighbours/flows)      | Image scrolls for tall captures; details panel; `onPrev/onNext`, `position`, `onSaveToggle/onCopyImage/onDownload`, `tagLinkRender`, `appLinkRender`, `flowLinkRender`.                 |
| `CollectionCard`                                               | `collection` (⊂ `Collection`)                                | 2×2 mosaic.                                                                                                                                                                             |
| `SelectionBar`, `SelectionBarButton`                           | `count`, `onClear`                                           | Floating dark bar; inert when `count === 0`.                                                                                                                                            |
| `UploadDropzone`, `UploadItem`                                 | `onFiles`, `onReject`, `status`, `progress`                  | Drag/click/paste; validates PNG/JPEG/WebP ≤ 15 MB.                                                                                                                                      |
| `SortableList`, `SortableHandle`, `moveItem`, `arrayMove`      | `items`, `getId`, `onReorder`, `renderItem`                  | dnd-kit; pointer + keyboard + announcements.                                                                                                                                            |
| `FlowStepItem`                                                 | `index`, `thumbUrl`, `label`, `onLabelChange`, `handle`      | Row for flow ordering.                                                                                                                                                                  |
| `KeyValue`, `KeyValueGroup`, `DetailList`, `DetailRow`, `Stat` | —                                                            | Meta rows, details panel, stats.                                                                                                                                                        |
| `Footer`                                                       | `logo`, `tagline`, `columns`, `legal`, `aside`, `renderLink` | —                                                                                                                                                                                       |

Helpers: `cn`, `screenFrame`, `frameKind`, `gridSizes`, `intrinsicSize`, `formatNumber`,
`formatCompact`, `pluralize`, `formatBytes`, `formatDimensions`, `formatDate`, `displayUrl`,
`initials`, `useHotkey`, `useScrolled`, `useIsMac`, `useScrollEdges`, `useControllableState`.

---

## 5. Page recipes

Shared library shell (every signed-in page):

```tsx
const [paletteOpen, setPaletteOpen] = useState(false);
useHotkey("k", () => setPaletteOpen((o) => !o));

<TopBar
  logo={<Link to="/browse/$platform" params={{ platform }} aria-label="Open UI home" className="ou-focus-ring rounded-sm"><Logo /></Link>}
  nav={<SegmentedControl aria-label="Platform" size="sm" value={platform} onValueChange={(p) => navigate({ params: { platform: p } })} options={PLATFORMS.map(({ slug, label }) => ({ value: slug, label }))} />}
  onSearchClick={() => setPaletteOpen(true)}
  searchPlaceholder={`Search ${labelFor(platform)} apps, screens, flows…`}
  actions={<>
    <Tooltip content="Saved"><TopBarIconButton aria-label="Saved" onClick={…}><Bookmark /></TopBarIconButton></Tooltip>
    <Button variant="outline" size="sm" className="ml-1 hidden sm:inline-flex" render={<Link to="/contribute" />}><Plus />Contribute</Button>
  </>}
  account={<AccountMenu user={me} onSignOut={signOut}>
    <DropdownMenuLinkItem icon={<Bookmark />} render={<Link to="/saved" />}>Saved</DropdownMenuLinkItem>
    {me.role === "admin" && <DropdownMenuLinkItem icon={<Inbox />} render={<Link to="/review" />}>Review queue</DropdownMenuLinkItem>}
    <DropdownMenuLinkItem icon={<Settings />} render={<Link to="/settings" />}>Settings</DropdownMenuLinkItem>
  </AccountMenu>}
/>
<main>{children}</main>
<SearchPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
```

No sidebar in the library. Footer only on public pages (landing, docs) and the bottom of long
library pages is optional.

### Landing (`/`, public)

- TopBar with `nav` = text links (Docs · GitHub), `account` = `<Button size="sm" render={<Link to="/sign-in" />}>Sign in</Button>`; no search.
- Hero: `Container`, `pt-24 pb-16`, centred: `h1.text-2xl sm:text-3xl font-semibold max-w-3xl` ("Real product screens, open to everyone"), `p.text-md text-fg-muted max-w-xl mt-4`, buttons `mt-8`: primary lg "Browse the library" + outline lg "Self-host".
- Proof: a non-interactive `ScreenGrid columns="apps-web"` of 3–4 `AppCard`s (or a marquee of `ScreenTile`s, `aria-hidden`), `mt-16`.
- Three feature rows (`grid sm:grid-cols-3 gap-6`), each `Card tone="tile" p-6`: lucide icon in `size-9 rounded-control bg-bg`, `text-md font-semibold`, `text-base text-fg-muted`. Topics: Contribute (uploader + extension), MCP for agents, Self-hostable.
- `Stat` row (screens · apps · flows) and a `CodeBlock` with `npx open-ui-mcp`.
- `Footer`.

### Discover (`/browse/$platform`)

```tsx
<Container className="pt-10 pb-24 sm:pt-12">
  <PageHeader title="Discover" actions={<SegmentedControl className="sm:hidden" … />} />
  <TabNav aria-label="Browse" className="mt-5">{/* Apps · Screens · UI Elements · Flows */}
    <TabNavItem active={tab === "apps"} render={<Link search={{ tab: "apps" }} />}>Apps</TabNavItem>…
  </TabNav>
  <CategoryChips className="mt-6" aria-label="Categories"
    items={tab === "apps" ? CATEGORIES : tab === "screens" ? PATTERNS : tab === "elements" ? ELEMENTS : FLOW_TYPES}
    value={filter ?? null} onValueChange={(v) => navigate({ search: (s) => ({ ...s, filter: v ?? undefined }) })}
    leading={<Button variant="secondary" className="h-9"><SlidersHorizontal />Filters</Button>} />
  <Toolbar className="mt-8 mb-6">
    <NativeSelect variant="ghost" aria-label="Sort" value={sort} onValueChange={…} options={[{ value: "latest", label: "Latest" }, { value: "popular", label: "Most popular" }]} />
    <ResultCount count={total} noun="screens" />
  </Toolbar>
  {isPending ? <ScreenGridSkeleton platform={platform} columns={…} withMeta={tab === "apps"} /> : (
    tab === "apps"    ? <ScreenGrid columns={platform === "web" ? "apps-web" : "apps-mobile"}>{apps.map((a, i) => <AppCard key={a.id} app={a} priority={i < 4} linkRender={…} />)}</ScreenGrid>
  : tab === "flows"   ? <ScreenGrid columns="flows">{flows.map((f) => <FlowCard key={f.id} flow={f} linkRender={<Link search={(s) => ({ ...s, flow: f.id })} />} />)}</ScreenGrid>
  :                     <ScreenGrid platform={platform}>{screens.map((s, i) => <ScreenTile key={s.id} screen={s} showApp priority={i < 4} onSaveToggle={…} selectable selected={…} onSelectedChange={…} linkRender={<Link search={(p) => ({ ...p, screen: s.id })} />} />)}</ScreenGrid>
  )}
  {/* infinite scroll: an IntersectionObserver sentinel after the grid; while fetching the next page append <ScreenGridSkeleton count={columns} /> */}
  <SelectionBar count={selected.size} onClear={clear}>
    <SelectionBarButton icon aria-label="Download"><Download /></SelectionBarButton>
    <SelectionBarButton><Copy />Copy</SelectionBarButton>
    <SelectionBarButton primary>Save</SelectionBarButton>
  </SelectionBar>
</Container>
```

"UI Elements" = Screens grid filtered by `element`. Empty results → `EmptyState tone="tile"` with
"Clear filters". Filters button opens `Popover` (desktop) / `Sheet side="bottom"` (mobile) with
`FilterChip`s and `Checkbox`es.

### App detail (`/apps/$slug`)

```tsx
<Container className="pt-8 pb-24 sm:pt-10">
  <AppHeader app={app}
    back={<Link to="/browse/$platform" className={cn(textLinkClassName, "inline-flex items-center gap-1.5 no-underline")}><ArrowLeft className="size-4" />Discover</Link>}
    actions={<>
      <Button variant={saved ? "secondary" : "primary"} aria-pressed={saved} onClick={toggleSave}><Bookmark className={saved ? "fill-current" : ""} />{saved ? "Saved" : "Save"}</Button>
      <Button variant="outline" render={<a href={app.websiteUrl} target="_blank" rel="noreferrer" />}>Visit site<ExternalLink /></Button>
      <DropdownMenu>…Copy link · Report an issue…</DropdownMenu>
    </>} />
  <Toolbar className="mt-12 mb-6">
    <div className="flex items-center gap-6">
      <NativeSelect variant="ghost" aria-label="Version" value={version} options={app.versions.map((v) => ({ value: v, label: v }))} … />
      <span aria-hidden className="h-6 w-px bg-border-strong" />
      <TabNav aria-label="App sections">Screens · UI Elements · Flows</TabNav>
    </div>
    <ResultCount count={app.screenCount} noun="screens" />
  </Toolbar>
  <ScreenGrid platform={app.platform}>{…ScreenTile (no showApp)…}</ScreenGrid>
  <section className="mt-16">
    <SectionHeader title="Flows" description={pluralize(app.flowCount, "flow")} className="mb-6" />
    <ScreenGrid columns="flows">{flows.map((f) => <FlowCard flow={f} hideApp … />)}</ScreenGrid>
  </section>
</Container>
```

### Screen viewer overlay (`?screen=$id` on any grid; `/screens/$id` standalone)

```tsx
<ScreenViewer open={!!search.screen} onOpenChange={(o) => !o && navigate({ search: (s) => ({ ...s, screen: undefined }) })}
  screen={detail} position={{ index, total }}
  onPrev={detail.previousId ? () => go(detail.previousId) : null}
  onNext={detail.nextId ? () => go(detail.nextId) : null}
  onSaveToggle={…} onCopyImage={copyImageToClipboard} onDownload={…}
  appLinkRender={<Link to="/apps/$slug" params={{ slug: detail.app.slug }} />}
  tagLinkRender={(kind, slug) => <Link to="/browse/$platform" params={{ platform }} search={{ tab: kind === "pattern" ? "screens" : "elements", filter: slug }} />}
  flowLinkRender={(f) => <Link search={(s) => ({ ...s, flow: f.id, screen: undefined })} />} />
```

Prefer the neighbours of the **current grid** for prev/next when opened from a grid; fall back to
`previousId/nextId`. While the next detail loads, keep the previous one rendered (no spinner
flash). Standalone page: `ScreenImage layout="natural"` in a `Container` + `ScreenDetails` in a
`lg:grid-cols-[1fr_360px]` grid.

### Flow viewer overlay (`?flow=$id`; `/flows/$id` standalone)

```tsx
<FlowViewer open flow={flowDetail} onOpenChange={close}
  onStepClick={(step) => navigate({ search: (s) => ({ ...s, screen: step.screen.id }) })}
  onSaveToggle={…} onCopy={…} onDownload={…} />
```

Opening a step stacks the ScreenViewer on top (both overlays can be open; Esc closes the top one).

### Search palette (⌘K anywhere, and `/search?q=` page)

```tsx
<CommandPalette open={open} onOpenChange={setOpen} search={q} onSearchChange={setQ}
  shouldFilter={false} loading={isFetching} emptyText={`No results for “${q}”`}
  rail={<>{["Trending", "Apps", "Screens", "UI Elements", "Flows"].map(…<CommandRailItem active={scope === x} icon={…} />)}</>}>
  <CommandGroup heading="Apps">{apps.map((a) => <CommandItem key={a.id} value={`app:${a.id}`} icon={<AppLogo app={a} size="sm" className="-m-0.5" />} hint={a.tagline} onSelect={() => go(`/apps/${a.slug}`)}>{a.name}</CommandItem>)}</CommandGroup>
  <CommandGroup heading="Screens">{/* pattern shortcuts + matching screens with tiny thumbs as icon */}</CommandGroup>
  <CommandGroup heading="Flows">…</CommandGroup>
</CommandPalette>
```

Empty query = "Trending" (top apps, popular patterns, flow types, categories). Debounce 150 ms.
`/search?q=` page: `PageHeader title={`Results for “${q}”`}` then three sections (Apps grid,
Screens grid with `showApp`, Flows grid), each `SectionHeader` with a "See all" link.

### Contribute wizard (`/contribute`)

`Container size="narrow"`, `PageHeader title="Contribute"` + `Steps` (`Upload · App · Tags · Flow ·
Review`) `mt-6`, one step per screen with a sticky footer bar (`border-t bg-bg/85 backdrop-blur`,
Back ghost + Continue primary on the right).

1. **Upload** — `UploadDropzone onFiles onReject` (toast the rejection reason), then a list of
   `UploadItem`s (thumb via `URL.createObjectURL`, size, remove). Platform via `SegmentedControl`.
2. **App** — `Field` + `Input` with suggestions (search existing apps in a `Popover` list) or "Create
   new app": name, website, category `Select`, tagline `Textarea`.
3. **Tags** — per screen: thumb + `FilterChip size="sm"` grid of `PATTERNS` (pre-selected via
   `suggestPatterns`) and an expandable element picker.
4. **Flow** (optional) — `Switch label="Save as a flow"`, name `Input`, type `Select` (`FLOW_TYPES`),
   then `SortableList` of `FlowStepItem` (drag or keyboard reorder, step labels).
5. **Review** — summary `DetailList`, a `ScreenGrid` preview, `Callout` "Members’ uploads are
   reviewed by an admin" (hidden for admins), primary "Submit"; progress through `UploadItem
status="uploading" progress`, success → `toast.success` + link.

### Review queue (`/review`, admin)

`PageHeader title="Review" description="…"`, `TabNav` Screens · Flows with counts as `Badge`.
Grid of pending items: `ScreenGrid platform` of `ScreenTile showApp selectable` (open → viewer
with Approve/Reject in `actions`), bulk approve/reject via `SelectionBar` (`primary` Approve,
`SelectionBarButton` Reject). Each tile shows `StatusBadge` as `badge`. Empty →
`EmptyState icon={<CheckCheck />} title="All caught up"`. Optional list view: `Table`.

### Settings (`/settings`)

`Container size="narrow"`, `PageHeader title="Settings"`, `Tabs` (Profile · API keys · Extension &
MCP) with `TabsList bordered`.

- Profile: `Card` with `Field`s (name, email read-only), `Avatar size="lg"`, `CardFooter` Save.
  Appearance row: `ThemeToggle size="md"`.
- API keys: `SectionHeader` + "Create key" button → `Dialog size="sm"` (name `Input`) → on success
  the dialog switches to a `Callout tone="warning"` + `CodeBlock code={token}` ("shown once").
  List in `Table` (name, `oui_xxxx••••`, last used, `Button variant="ghost" size="sm"` Revoke →
  confirm `Dialog` with `variant="danger"`).
- Extension & MCP: `Card`s with `CodeBlock`s (local `npx open-ui-mcp` config JSON; remote URL +
  bearer header), and an install button for the extension.

### Docs layout (`/docs/*`, public)

TopBar (`nav` = Docs · Library links, search optional). Body
`Container` → `grid lg:grid-cols-[220px_minmax(0,1fr)_200px] gap-10 pt-10`:
left nav (`nav` list, items `text-base text-fg-muted hover:text-fg`, active `text-fg font-medium`,
`sticky top-[calc(var(--spacing-topbar)+24px)]`), centre `<Prose>` (rendered markdown; code blocks
already styled), right "On this page" (`text-sm`), hidden below `lg`. Mobile nav in
`Sheet side="left"`. `Footer` at the bottom.

### Auth pages (`/sign-in`, `/sign-up`)

No TopBar. Full-height centred column: `min-h-dvh grid place-items-center px-4`,
`Logo` (link home) above a `w-full max-w-sm` stack: `h1.text-xl font-semibold`,
`p.text-base text-fg-muted`, OAuth `Button variant="outline" size="lg" className="w-full"`
("Continue with GitHub", only when configured), divider (`Separator` with "or" in `text-sm
text-fg-subtle`), `Field`s (email, password) with `Input size="lg"`, primary `Button size="lg"
className="w-full" loading={pending}`, `FieldError` for server errors, footer link
(`TextLink`) to the other auth page. Optional right half on `lg+`: `bg-tile` panel with a
non-interactive `ScreenTile` collage (`aria-hidden`).

### Extension connect (`/extension/connect`)

Auth-page layout; `EmptyState icon={<PlugZap />}` style block with `Spinner` while minting, then
`CircleCheck` + "Connected — you can close this tab".

---

## 6. Performance (browse route budget: < 120 KB JS gzip)

Measured with `node showcase/scripts/bundle-budget.ts` (Vite production build; React DOM alone is
66 KB gzip):

| What renders on first load                                                                                        | Initial JS gzip    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------ |
| React DOM only                                                                                                    | 66 KB              |
| TopBar · AccountMenu · tabs · CategoryChips · NativeSelect · grid of AppCard/ScreenTile · Tooltip · ThemeProvider | **89 KB** (+23 KB) |
| … plus `Toaster`                                                                                                  | 99 KB              |
| AccountMenu popup (loaded on first hover/focus)                                                                   | +43 KB, lazy       |

The first Base UI popup on a page (Menu, Select, Popover, Dialog, Lightbox, CommandPalette)
brings the shared positioning/focus engine (~40 KB). Keep it off the critical path:

- Discover/App pages: `NativeSelect` for sort/version (not `Select`); `Tooltip` is already light;
  `AccountMenu` is already lazy.
- Lazy-load overlays that only appear after interaction, via deep imports:
  ```tsx
  const ScreenViewer = lazy(() =>
    import("@open-ui/ui/components/screen-viewer").then((m) => ({ default: m.ScreenViewer })),
  );
  const FlowViewer = lazy(() =>
    import("@open-ui/ui/components/flow-viewer").then((m) => ({ default: m.FlowViewer })),
  );
  const CommandPalette = lazy(() => import("./search-palette")); // your wrapper around CommandPalette
  ```
  Render them only when open (`{search.screen ? <Suspense><ScreenViewer … /></Suspense> : null}`)
  and prefetch on intent (hover a tile → `import(…)`; focus the search pill → prefetch palette).
  For deep links (`?screen=` on first load) the chunk loads in parallel with the data.
- Mount `<Toaster />` after hydration (`useEffect(() => setReady(true))`) if the route doesn't toast on load.
- Never import `@open-ui/core` (root) or `@open-ui/core/schemas` values in client components: they
  pull in zod. Types (`import type`) and `@open-ui/core/taxonomy` are free.
- Images: `priority` for the first row only; thumbnails (`thumbUrl`) in grids, `imageUrl` only in
  the viewer.

## 7. Do / don't

- **Do** reuse `ScreenGrid` recipes and `ScreenTile`; never hand-roll image grids.
- **Do** pass `priority` to the first row only (≈4 tiles); everything else lazy.
- **Do** keep overlays URL-driven (`?screen=`, `?flow=`) so they are deep-linkable and Back closes them.
- **Don't** introduce new colours, shadows, radii or font sizes in app code — add a token here.
- **Don't** nest interactive elements (tiles already separate the open link and the Save button).
- **Don't** use `dark:` for component styling; use semantic tokens.
- **Don't** import from `@open-ui/core` (the root) in client components that only need taxonomy —
  import `@open-ui/core/taxonomy` to keep zod out of the browse bundle.
