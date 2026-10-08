---
title: Keyboard shortcuts
description: Every page is reachable from the keyboard. The command palette, "g" navigation shortcuts, viewer and review keys, and how they behave.
order: 4
section: Using Screen Commons
---

Every page in Screen Commons works from the keyboard. `Tab` moves through links and controls, `Enter` follows or presses them, and `Esc` closes whatever is on top. The shortcuts below speed that up. Press `?` on any page to see the ones that apply to you.

On macOS, `⌘` stands in for `Ctrl`.

## Anywhere

| Shortcut        | Action                         |
| --------------- | ------------------------------ |
| `⌘K` / `Ctrl+K` | Search and commands            |
| `/`             | Search                         |
| `?`             | Keyboard shortcuts             |
| `Esc`           | Close a dialog, menu or viewer |

The palette (`⌘K` or `/`) searches the library and lists commands at the same time. Type a page name such as "saved" or "api keys" to go there, "switch to iOS" to change platform, or a doc title to open it. Commands keep the platform you are on: **Browse flows** from iOS opens the iOS flows tab. Signed out, the palette lists the public pages and the docs.

`⌘K` works even while you type in a field. The letter shortcuts do not, so they never get in the way of typing.

## Go to

Press `G`, then a letter, within a second and a half. After `G`, a hint at the bottom of the screen lists the letters you can press next.

| Shortcut     | Page         | Available to |
| ------------ | ------------ | ------------ |
| `G` then `H` | Home         | Signed out   |
| `G` then `H` | Discover     | Signed in    |
| `G` then `S` | Saved        | Signed in    |
| `G` then `C` | Contribute   | Signed in    |
| `G` then `,` | Settings     | Signed in    |
| `G` then `R` | Review queue | Admins       |
| `G` then `D` | Docs         | Everyone     |

The palette also reaches the browse tabs (apps, screens, UI elements, flows), each settings tab, **Connect the browser extension**, **Sign in** and **Create an account**. You only see the commands for pages you can open.

## Grids

| Shortcut     | Action                                    |
| ------------ | ----------------------------------------- |
| `Tab`        | Move between tiles and controls           |
| `Enter`      | Open the focused tile                     |
| `Space`      | Select the focused tile’s checkbox        |
| `Shift`      | Hold while clicking: select a range       |
| `⌘` / `Ctrl` | Hold while clicking: add to the selection |
| `Esc`        | Clear the selection                       |

Filters, tabs and the platform switch are ordinary buttons and links, so `Tab` and `Enter` (or `Space`) operate them.

## Screen viewer

| Shortcut        | Action                    |
| --------------- | ------------------------- |
| `←`             | Previous screen           |
| `→`             | Next screen               |
| `S`             | Save or unsave            |
| `⌘C` / `Ctrl+C` | Copy image                |
| `Z`             | Toggle fit / actual width |

The arrows, `S` and `⌘C` also work on a standalone screen page (`/screens/<id>`). `⌘C` copies the image only when no text is selected, so copying text still works.

## Contribute

| Shortcut        | Action                                      |
| --------------- | ------------------------------------------- |
| `Space`         | Pick up or drop a screen (focus its handle) |
| `↑` `↓` `←` `→` | Move it                                     |
| `Esc`           | Cancel the move                             |

On the upload step, focus the drop area and press `Enter` or `Space` to choose files. Screen readers announce each pick-up, move and drop.

## Review

Admins only, on `/review`.

| Shortcut | Action                                   |
| -------- | ---------------------------------------- |
| `J`      | Next item                                |
| `K`      | Previous item                            |
| `A`      | Approve                                  |
| `R`      | Reject (type a reason, Enter to confirm) |

Hold `J` or `K` to keep moving. `Esc` closes the reason field without rejecting.

## How shortcuts behave

- **Only the top layer listens.** While a dialog, menu or the palette is open, page shortcuts pause. The viewer's keys pause while a dialog such as the collection picker sits on top of it. `⌘K`, `/` and `?` work everywhere.
- **Typing is safe.** Letter shortcuts are ignored in text fields and select menus, and while an input method editor (IME) is composing.
- **No surprises from modifiers or held keys.** `S` doesn't fire on `⌘S` or `Alt+S`, and holding a key doesn't repeat an action. The exceptions are the arrows and `J`/`K`, which keep moving.
- **Browser and system shortcuts stay yours.** Navigation uses `G` sequences rather than `Ctrl` or `Alt` chords. `⌥⇧S`, `⌥⇧V` and `⌥⇧E` belong to the [browser extension](/docs/extension).
- **Focus comes back.** Closing a dialog returns focus to where you were, and every page starts with a **Skip to content** link.

Buttons with a single-key shortcut expose it to assistive technology through `aria-keyshortcuts`. Hints next to links and menu items are read out as "G then S".
