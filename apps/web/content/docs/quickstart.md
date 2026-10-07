---
title: Quickstart
description: Run Open UI on your machine in five minutes, with local D1 and R2 and no Cloudflare account.
order: 2
section: Getting started
---

Open UI runs locally inside `workerd`, the Cloudflare Workers runtime, with emulated D1 (database) and R2 (image storage). You don't need a Cloudflare account to develop.

## Prerequisites

- Node.js 24
- pnpm 11 (the repository pins `pnpm@11.25.0`; `corepack enable` picks it up)
- Git

## 1. Install

```bash
git clone https://github.com/lmdevv/open-ui.git
cd open-ui
pnpm install
```

## 2. Configure

Copy the example environment file:

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Set `BETTER_AUTH_SECRET` to a long random string. This command prints one:

```bash
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

| Variable               | Required | Purpose                                                                                           |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`   | Yes      | Signs session cookies.                                                                            |
| `GITHUB_CLIENT_ID`     | No       | Enables **Continue with GitHub**. Callback URL: `http://localhost:5173/api/auth/callback/github`. |
| `GITHUB_CLIENT_SECRET` | No       | Required together with `GITHUB_CLIENT_ID`.                                                        |

> **Note**
> On `http://localhost` the server falls back to a built-in development secret if `BETTER_AUTH_SECRET` is missing. Set your own anyway. On any other URL, sign-in fails without one.

## 3. Start the dev server

```bash
pnpm dev
```

This applies database migrations to the local D1 database, then starts the app at [http://localhost:5173](http://localhost:5173).

> **Warning**
> Always use `http://localhost:5173`, not `http://127.0.0.1:5173`. Auth cookies and trusted origins are bound to `localhost`, so sign-in fails on `127.0.0.1`.

## 4. Create the admin account

Open [http://localhost:5173/sign-up](http://localhost:5173/sign-up) and create an account. The first account on an instance becomes the **admin**: your uploads publish immediately and you can review other people's contributions.

## 5. Add content

Pick one:

- **Upload screenshots** at [/contribute](http://localhost:5173/contribute). See [Contributing](/docs/contributing).
- **Capture live sites** with the [browser extension](/docs/extension).
- **Seed a demo catalog** of public marketing sites (home, pricing, sign in, docs, blog and more):

  1. Create an API key at [/settings](http://localhost:5173/settings). See [API keys](/docs/api-keys).
  2. Capture the pages with headless Chromium, then upload them:

     ```bash
     pnpm seed capture
     pnpm seed upload --url http://localhost:5173 --key oui_…
     ```

  Captures are cached locally and never committed. Seeding needs Chrome or Chromium installed; set `CHROME_PATH` if it isn't found automatically.

## 6. Open the library

Go to [http://localhost:5173/browse/web](http://localhost:5173/browse/web). Press `⌘K` (`Ctrl+K` on Windows and Linux) to search.

## Useful commands

| Command                           | What it does                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                        | Migrate the local database and start the web app.                      |
| `pnpm dev:extension`              | Build the extension and open a browser with it loaded.                 |
| `pnpm --filter @open-ui/web test` | Run the API integration suite against a fresh dev server on port 5179. |
| `pnpm check`                      | Lint, format check and type check the whole repo.                      |
| `pnpm build`                      | Production build of every package.                                     |

Local data lives in `apps/web/.wrangler/state`. Delete that directory to start over with an empty instance.

## Next steps

- [Browsing](/docs/browsing)
- [Browser extension](/docs/extension)
- [MCP](/docs/mcp)
