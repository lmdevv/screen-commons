---
title: Introduction
description: What Screen Commons is, the concepts it is built on, and how content gets into the library.
order: 1
section: Getting started
---

Screen Commons is an open-source, self-hostable UI reference library. It is a curated catalog of real product screens and ordered user flows, grouped by app and searchable by screen pattern, UI element and flow type.

You run your own instance on Cloudflare (or locally), invite your team, and fill it from three places: the website uploader, the browser extension, and AI agents through MCP. Agents can also search the catalog for inspiration.

## Concepts

| Concept        | What it is                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **App**        | A product, such as Linear or Stripe. Has a name, website, platform (`web`, `ios`, `android`), category, tagline and logo. |
| **Screen**     | One screenshot of an app, with a title, source URL, patterns, UI elements, tags and a version label such as `Oct 2026`.   |
| **Flow**       | An ordered sequence of 2 to 60 screens from one app, with a name, a flow type and a label per step.                       |
| **Pattern**    | What a whole screen is: Landing, Pricing, Login, Signup, Dashboard, Settings, Checkout and 23 more.                       |
| **UI element** | A component visible on a screen: Dialog, Table, Tabs, Pricing Table, Toast and 38 more.                                   |
| **Flow type**  | What a flow accomplishes: Onboarding, Signing Up, Checkout, Resetting Password and 12 more.                               |
| **Collection** | Your saved screens, flows and apps. Everyone has a default collection called **Saved** and can create more.               |

Patterns, UI elements, flow types and categories come from a fixed taxonomy so filters stay consistent. Fetch the full list from [`GET /api/v1/taxonomy`](/docs/api#taxonomy).

## Roles and review

An instance has two roles:

- **Admin.** The first account created on an instance becomes the admin. Admin contributions publish immediately. Admins approve or reject other people's contributions from `/review`.
- **Member.** Everyone else. Member contributions start as `pending` and appear in the library once an admin approves them.

Every screen and flow has a status: `published`, `pending` or `rejected`. Only published content is visible to everyone. You always see your own pending items.

> **Note**
> The library is private to signed-in users. Logged-out visitors can only see the landing page, these docs, and the sign-in and sign-up pages.

## How content gets in

| Source                                 | Best for                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| [Website uploader](/docs/contributing) | Screenshots you already have, including mobile app screens.                             |
| [Browser extension](/docs/extension)   | Capturing live websites: visible area, full page, or a single element. Recording flows. |
| [MCP server](/docs/mcp)                | Letting an AI agent crawl a site, capture pages and upload them.                        |
| [REST API](/docs/api)                  | Scripts and integrations.                                                               |

Every path ends at the same API, so the same limits and review rules apply everywhere.

## Next steps

- [Quickstart](/docs/quickstart): run Screen Commons locally in five minutes.
- [Browsing](/docs/browsing): find screens and flows, and save them.
- [Self-hosting](/docs/self-hosting): deploy your own instance to Cloudflare.
