# Open UI

Open UI is an open-source, self-hostable UI reference library in the spirit of Mobbin. It's a catalog of real product screens and ordered user flows, grouped by app and searchable by screen pattern (Pricing, Login, Dashboard), UI element (Table, Tabs, Toast) and flow type (Onboarding, Checkout). Fill it from the website, a browser extension, or AI agents over MCP, and let those same agents search it for inspiration. It runs on Cloudflare Workers, D1 and R2, and locally with no Cloudflare account.

![Open UI](docs/assets/screenshot.png)

## Features

- **Browse and search** apps, screens, UI elements and flows for web, iOS and Android, including text inside screenshots. `⌘K` from anywhere.
- **Viewer** with keyboard navigation, deep links, save, download and copy image.
- **Collections** to save screens, flows and apps.
- **Contribute** from the website: drop images, tag them, order them into a flow.
- **Browser extension** for Chrome, Edge and Firefox: capture the visible area, the full page or one element, record flows, and upload from a tray.
- **MCP**: a remote server at `/mcp` for catalog search and uploads, and a local `open-ui-mcp` server that adds browser tools to crawl, capture and upload sites through your real browser or headless Chromium.
- **REST API** with API keys and a typed TypeScript client.
- **Review workflow**: the first account is admin; member contributions wait for approval.

## Quickstart

Requires Node.js 24 and pnpm 11.

```bash
git clone https://github.com/lmdevv/open-ui.git
cd open-ui
pnpm install
cp apps/web/.dev.vars.example apps/web/.dev.vars   # then set BETTER_AUTH_SECRET
pnpm dev
```

Open <http://localhost:5173/sign-up> and create an account. The first account on an instance becomes the admin.

To fill the library with demo content, create an API key in **Settings** and run `pnpm seed capture`, then `pnpm seed upload --url http://localhost:5173 --key oui_…`. See the [Quickstart](apps/web/content/docs/quickstart.md) for details.

## Monorepo

| Path               | What it is                                                                           |
| ------------------ | ------------------------------------------------------------------------------------ |
| `apps/web`         | TanStack Start on Cloudflare Workers: UI, REST API, remote MCP, media, docs.         |
| `apps/extension`   | WXT browser extension: capture, tray, MCP bridge client.                             |
| `packages/core`    | zod schemas, taxonomy, API types, typed API client, MCP tool specs, bridge protocol. |
| `packages/db`      | Drizzle schema and D1 migrations, including FTS5 search.                             |
| `packages/ui`      | Design tokens and React primitives shared by web and extension.                      |
| `packages/capture` | Page capture and crawl engine with a headless `playwright-core` driver.              |
| `packages/mcp`     | `open-ui-mcp` stdio MCP server: catalog and browser tools.                           |
| `packages/config`  | Shared TypeScript configuration.                                                     |
| `scripts/seed`     | Captures curated public sites and uploads them through the API.                      |
| `docs/spec.md`     | Build specification.                                                                 |

## Documentation

The docs ship with every instance at `/docs` (for example `http://localhost:5173/docs`) and live as Markdown in [`apps/web/content/docs`](apps/web/content/docs).

| Page                                                          | On an instance       |
| ------------------------------------------------------------- | -------------------- |
| [Introduction](apps/web/content/docs/index.md)                | `/docs`              |
| [Quickstart](apps/web/content/docs/quickstart.md)             | `/docs/quickstart`   |
| [Browsing](apps/web/content/docs/browsing.md)                 | `/docs/browsing`     |
| [Contributing screens](apps/web/content/docs/contributing.md) | `/docs/contributing` |
| [Browser extension](apps/web/content/docs/extension.md)       | `/docs/extension`    |
| [MCP](apps/web/content/docs/mcp.md)                           | `/docs/mcp`          |
| [REST API](apps/web/content/docs/api.md)                      | `/docs/api`          |
| [API keys](apps/web/content/docs/api-keys.md)                 | `/docs/api-keys`     |
| [Self-hosting](apps/web/content/docs/self-hosting.md)         | `/docs/self-hosting` |
| [Architecture](apps/web/content/docs/architecture.md)         | `/docs/architecture` |

## Development

| Command              | What it does                                                      |
| -------------------- | ----------------------------------------------------------------- |
| `pnpm dev`           | Migrate the local D1 database and start the web app on port 5173. |
| `pnpm dev:extension` | Build the extension in watch mode and open a browser with it.     |
| `pnpm test`          | Run all test suites.                                              |
| `pnpm check`         | Lint, format check and type check.                                |
| `pnpm format`        | Format the codebase.                                              |
| `pnpm build`         | Production build of every package.                                |

Use `http://localhost:5173`, not `127.0.0.1`; auth cookies are bound to `localhost`.

## Contributing

Issues and pull requests are welcome.

1. Read [`docs/spec.md`](docs/spec.md). `packages/core` is the shared contract; change it first when an API changes.
2. Keep changes focused, and add tests next to the code you touch.
3. Run `pnpm check` and `pnpm test` before opening a pull request.

When contributing screenshots to an instance, follow the [content policy](apps/web/content/docs/contributing.md#content-policy): public pages only, no personal data or secrets, and respect each site's terms.

## License

[Apache-2.0](LICENSE)
