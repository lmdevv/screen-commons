---
title: Browsing
description: Find screens and flows with tabs, filters and search, use the viewer and its shortcuts, and save references to collections.
order: 3
section: Using Open UI
---

Everything in the library requires an account. Sign in and you land on **Discover** for the web platform at `/browse/web`.

## Discover

Use the platform switch in the top bar to move between **Web**, **iOS** and **Android** (`/browse/web`, `/browse/ios`, `/browse/android`). Each platform has four tabs:

| Tab             | Shows                                                         |
| --------------- | ------------------------------------------------------------- |
| **Apps**        | One card per app with its latest screens. Filter by category. |
| **Screens**     | Every screen. Filter by screen pattern, such as Pricing.      |
| **UI Elements** | Screens filtered by component, such as Table or Toast.        |
| **Flows**       | Ordered flows. Filter by flow type, such as Onboarding.       |

Sort by **Latest** (newest first) or **Popular** (ranked by saves and views). Grids load more as you scroll.

### App pages

Click an app to open `/apps/<slug>`. The header shows the logo, name, tagline, platform, category and a link to the website. Tabs list the app's **Screens**, **UI Elements** and **Flows**. Use the version filter to compare captures over time; versions default to the capture month, such as `Oct 2026`.

## Search

Press `⌘K` (`Ctrl+K` on Windows and Linux) anywhere to open the command palette, or go to `/search?q=…` for full results grouped into apps, screens and flows.

Search matches:

- App names, taglines, descriptions and domains.
- Screen titles, app names, patterns, UI elements, tags and source URLs.
- **Text in the screenshot.** Captures from the extension and the MCP server include the page's visible text, so a query like `billed yearly` finds pricing pages that say it.
- Flow names, descriptions and types.
- Taxonomy terms. Typing `call to action` suggests the **Call to Action** element filter.

Every word must match, and each word also matches as a prefix: `pric tab` finds screens tagged **Pricing Table**. If nothing matches all the words, Open UI shows results that match any of them.

## The viewer

Click a screen to open it in the viewer without leaving the grid. The URL gains `?screen=<id>`, so you can share a link to exactly that screen. `/screens/<id>` is the standalone page.

The viewer shows the full image (tall pages scroll) and a details panel: app, patterns, UI elements, source URL, image size and capture date. From there you can **Save**, **Download** or **Copy image**.

Flows open the same way with `?flow=<id>` (standalone at `/flows/<id>`). Steps appear as an ordered strip with their labels.

### Keyboard shortcuts

| Shortcut        | Action                                   |
| --------------- | ---------------------------------------- |
| `⌘K` / `Ctrl+K` | Open search from anywhere.               |
| `←` / `→`       | Previous or next screen.                 |
| `Esc`           | Close the viewer or palette.             |
| `S`             | Save the current screen to **Saved**.    |
| `⌘C` / `Ctrl+C` | Copy the current image to the clipboard. |
| `Shift` + click | Select several items in a grid.          |
| `?`             | Show all shortcuts.                      |

## Collections

Save screens, flows and apps to collections. Everyone starts with a default collection called **Saved**; create as many more as you like and rename them at any time. The default collection can't be deleted.

Your collections are at `/saved`. They are private to your account.

> **Note**
> An item shows as saved if it is in any of your collections. Unsaving an item without picking a collection removes it from all of them.
