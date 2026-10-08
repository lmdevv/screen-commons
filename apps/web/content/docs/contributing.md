---
title: Contributing screens
description: Upload screens and flows from the website, describe them well, and get them through review.
order: 4
section: Using Screen Commons
---

Anyone with an account can contribute. Admin contributions publish immediately; member contributions wait for an admin to review them.

## Upload from the website

1. Go to `/contribute` and drop one or more images (PNG, JPEG or WebP).
2. Pick an existing app or create a new one: name, website, platform and, optionally, category.
3. Tag each screen with its screen patterns (what the screen is) and UI elements (what's on it).
4. Optionally turn the screens into a flow: drag them into order, add a label to each step, and choose a flow name and type.
5. Submit.

Your browser encodes each screen as WebP and generates its thumbnail before upload, so uploads are small and nothing is re-encoded on the server. Pages taller than 16,383 px (WebP's limit) are scaled down to fit. If your browser can't encode WebP (Safari), the original is uploaded and the server converts it.

To capture live websites instead, use the [browser extension](/docs/extension).

## Write good metadata

| Field       | Guidance                                                                                              | Limit                       |
| ----------- | ----------------------------------------------------------------------------------------------------- | --------------------------- |
| App name    | The product's name as it brands itself: `Linear`, not `linear.app`.                                   | 80 characters               |
| Website     | The product's root URL, such as `https://linear.app`. Uploads with the same domain join the same app. | Full `http(s)` URL          |
| Platform    | `web`, `ios` or `android`. Defaults to `web`.                                                         | —                           |
| Title       | What the screen shows: `Choose a plan`, `Invite teammates`.                                           | 160 characters              |
| Patterns    | What the whole screen is: Pricing, Login, Dashboard.                                                  | 8 per screen                |
| UI elements | Notable components on the screen: Pricing Table, Toggle, Toast.                                       | 24 per screen               |
| Tags        | Free-form keywords for anything the taxonomy doesn't cover.                                           | 16 tags, 40 characters each |
| Version     | A label for when the UI was captured. Defaults to the capture month, such as `Oct 2026`.              | 40 characters               |
| Flow name   | What the user is doing: `Sign up and pick a plan`.                                                    | 80 characters               |
| Step label  | What happens on that step: `Enter email`.                                                             | 80 characters               |

Use [`GET /api/v1/taxonomy`](/docs/api#taxonomy) for the full list of patterns, UI elements, flow types and categories.

### How uploads find their app

Screen Commons matches an upload to an existing app on the same platform by, in order: the app's slug, the website's domain, then a slug derived from the name. If nothing matches, it creates the app.

When you upload to an app that's already published, your screens attach to it but the app's name, tagline, description, category, website and logo don't change. Only admins, or the member who created a still-pending app, can fill in app details.

Uploading an image that's already in the app (byte for byte) returns the existing screen instead of creating a duplicate.

## Review

| Status      | Who can see it                   | What happens next                                         |
| ----------- | -------------------------------- | --------------------------------------------------------- |
| `pending`   | You and admins.                  | Waits in the admin queue at `/review`, oldest first.      |
| `published` | Everyone on the instance.        | Appears in Discover, search, the API and MCP.             |
| `rejected`  | You (by direct link) and admins. | Removed from listings and from every flow it was part of. |

- Approving a screen or flow also publishes its app if the app was still pending.
- Approving a flow publishes any of its screens that were still pending.
- A flow is published only when every one of its screens is published.
- Rejecting a screen removes it from its flows and renumbers the remaining steps. A published flow left with fewer than two steps goes back to `pending`.

## Image requirements

| Requirement        | Value                                               |
| ------------------ | --------------------------------------------------- |
| Formats            | PNG, JPEG, WebP                                     |
| Maximum file size  | 15 MiB per image                                    |
| Maximum dimensions | 4096 px wide, 20,000 px tall                        |
| Thumbnail          | 640 px wide, at most 1 MiB, generated by the client |
| Displayed as       | WebP, up to 4096 × 16,383 px (taller pages scaled)  |
| Screens per upload | 50                                                  |
| Images per request | 28 MiB decoded in total; split larger batches       |
| Steps per flow     | 2 to 60                                             |

Screen Commons reads the real type and dimensions from each file's header and rejects anything that doesn't match. Full-size images are stored exactly as uploaded.

> **Note**
> The browser extension shrinks or re-encodes captures that exceed these limits before upload, and splits large trays into several requests automatically.

## Content policy

Screen Commons is a reference library of public product UI. Before you upload:

- **Capture public pages only.** Marketing sites, docs, pricing, sign-up and sign-in pages are fine. Don't upload internal tools, private dashboards or anything behind someone else's login.
- **Remove personal data.** No real names, email addresses, avatars, messages, addresses or payment details, whether yours or anyone else's. Use demo or test accounts when you capture product screens.
- **Never include secrets.** No API keys, tokens, passwords, QR codes, invoice links or internal URLs.
- **Respect site terms.** Follow each site's terms of service and `robots.txt`. Don't crawl aggressively.
- **Keep it UI.** No ads, illegal content or images you don't have the right to share.

> **Warning**
> Captures include the page's visible text so that search can find it. Check the page before you capture: if text on screen is private, the upload will contain it.

Admins should reject contributions that break these rules.
