---
title: Self-hosting
description: Deploy Open UI to Cloudflare Workers with D1 and R2, configure auth and your domain, and keep backups.
order: 9
section: Self-hosting
---

Open UI runs on Cloudflare: one Worker serves the website, the REST API, remote MCP and images, backed by a D1 database and an R2 bucket.

## Prerequisites

- A Cloudflare account.
- The repository cloned and installed (see [Quickstart](/docs/quickstart)).
- Wrangler, the Cloudflare CLI, is already a dependency of the web app. Run it from `apps/web`:

```bash
cd apps/web
pnpm exec wrangler login
```

All commands below run in `apps/web`.

## 1. Create the database and bucket

```bash
pnpm exec wrangler d1 create open-ui
pnpm exec wrangler r2 bucket create open-ui-media
```

`d1 create` prints a `database_id`. Copy it.

## 2. Configure `wrangler.jsonc`

Open `apps/web/wrangler.jsonc`, paste the `database_id`, and set `APP_URL` to the URL your instance will live at:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "open-ui",
      "database_id": "<your database id>",
      "migrations_dir": "../../packages/db/migrations",
    },
  ],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "open-ui-media" }],
  "vars": {
    "APP_URL": "https://ui.example.com",
  },
}
```

`APP_URL` is the public origin, with no trailing slash. Auth cookies, trusted origins, OAuth callbacks and every absolute URL the API returns are based on it.

Local development reads the same file, so add the local URL to `apps/web/.dev.vars` to keep `pnpm dev` working. Values in `.dev.vars` override `vars` locally:

```bash
APP_URL=http://localhost:5173
```

> **Warning**
> Don't deploy with `APP_URL` still set to `http://localhost:5173`. Sign-in won't work on your real domain, returned URLs will point to localhost, and the server will accept a missing `BETTER_AUTH_SECRET` by falling back to the public development secret.

If you named the database or bucket differently, update `database_name` and `bucket_name` to match. Keep the `DB` and `MEDIA` binding names.

## 3. Set secrets

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

Paste a long random value when prompted. Generate one with:

```bash
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

| Secret                 | Required | Purpose                                         |
| ---------------------- | -------- | ----------------------------------------------- |
| `BETTER_AUTH_SECRET`   | Yes      | Signs sessions. Changing it signs everyone out. |
| `GITHUB_CLIENT_ID`     | No       | Enables **Continue with GitHub**.               |
| `GITHUB_CLIENT_SECRET` | No       | Required together with `GITHUB_CLIENT_ID`.      |

### GitHub sign-in (optional)

1. On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Homepage URL** to your `APP_URL` and **Authorization callback URL** to `https://ui.example.com/api/auth/callback/github`.
3. Store the credentials:

   ```bash
   pnpm exec wrangler secret put GITHUB_CLIENT_ID
   pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
   ```

Email and password sign-in is always on.

## 4. Deploy

```bash
pnpm run deploy
```

From the repository root, the equivalent is `pnpm --filter @open-ui/web run deploy`.

This builds the app, applies database migrations to the remote D1 database, and deploys the Worker. Run it again for every update; migrations that already ran are skipped.

> **Note**
> Include `run`. `pnpm deploy` without it is a built-in pnpm command that does something else entirely.

To apply migrations on their own, use `pnpm db:migrate:remote`.

## 5. Add your domain

Wrangler deploys to `https://open-ui.<your-subdomain>.workers.dev`. To serve it from your own domain (the zone must be on Cloudflare), either:

- In the Cloudflare dashboard, open **Workers & Pages → open-ui → Settings → Domains & Routes → Add → Custom domain**, or
- Add a route to `wrangler.jsonc` and deploy again:

  ```jsonc
  "routes": [{ "pattern": "ui.example.com", "custom_domain": true }]
  ```

Make sure `APP_URL` matches the domain people will use.

## 6. Create the admin account

Open `https://ui.example.com/sign-up` and create your account **before you share the URL**. The first account on an instance becomes the admin; everyone after that is a member.

There's no UI for changing roles yet. To promote another user, run SQL against the database:

```bash
pnpm exec wrangler d1 execute open-ui --remote \
  --command "UPDATE user SET role = 'admin' WHERE email = 'grace@example.com'"
```

Then [seed the catalog](/docs/quickstart#5-add-content) with your instance's URL, or start capturing with the [extension](/docs/extension).

## Backups

Images live in R2 and everything else in D1.

- **D1 Time Travel** keeps point-in-time history automatically. Restore with `pnpm exec wrangler d1 time-travel restore open-ui --timestamp <unix-time-or-rfc3339>`. Check your plan's retention window.
- **`wrangler d1 export` doesn't support virtual tables**, and search uses FTS5 virtual tables (`screen_fts`, `app_fts`, `flow_fts`), so a plain export of the database fails. Rely on Time Travel for recovery. The search index is derived from the base tables by triggers, so the base tables are the data that matters.
- **R2** has no built-in snapshots. Copy the bucket with any S3-compatible tool if you need an off-site copy. Image keys are content hashes, so incremental copies are cheap.

> **Warning**
> Test your restore process before you need it. Restoring D1 without the matching R2 objects leaves screens with missing images.

## Operations

- **Logs.** Workers observability is enabled in `wrangler.jsonc`. Stream live logs with `pnpm exec wrangler tail`.
- **Limits.** Uploads are capped at 40 MiB per request and 15 MiB per image; see [REST API limits](/docs/api#limits).
- **Updating.** Pull the latest code, then `pnpm install` and `pnpm run deploy` in `apps/web`.
