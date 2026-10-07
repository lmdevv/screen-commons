---
title: API keys
description: Create and revoke keys for scripts, the extension and MCP, and keep them safe.
order: 8
section: Integrations
---

API keys let scripts, the browser extension and MCP servers act as you. Every key starts with `oui_`.

## Create a key

1. Go to **Settings** (`/settings`) on your instance.
2. Under **API keys**, enter a name that says where the key will live, such as `Laptop MCP` or `CI seed`.
3. Click **Create key**.
4. Copy the key. It's shown **once**; Open UI only stores a hash of it.

The browser extension creates its own key, named **Browser extension**, when you click **Connect**. See [Browser extension](/docs/extension#connect-your-account).

Use the key as a bearer token:

```bash
curl http://localhost:5173/api/v1/me \
  -H "Authorization: Bearer oui_…"
```

## What a key can do

A key has exactly your account's permissions. There are no per-key scopes.

| Your role  | A key can                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- |
| **Member** | Browse and search, upload screens and flows (they wait for review), manage your collections. |
| **Admin**  | Everything a member can, plus publish directly and approve or reject contributions.          |

Keys can't manage keys. Creating, listing and revoking keys requires a signed-in session on the website, so a leaked key can't create new ones or revoke yours.

## Revoke a key

In **Settings → API keys**, click **Revoke** next to the key. It stops working immediately; requests with it get `401 unauthorized`.

The list shows each key's name, its first eight characters (such as `oui_qy9o…`), when it was created and when it was last used. Use the prefix and last-used time to find keys you no longer need.

## Keep keys safe

- **Treat a key like a password.** Anyone who has it can upload and browse as you.
- **One key per place.** Create separate keys for your laptop, CI and each agent, so you can revoke one without breaking the others.
- **Keep keys out of source control.** Pass them through environment variables such as `OPEN_UI_API_KEY`, or your client's secret store.
- **Don't put keys in front-end code.** The API accepts bearer keys from any origin, so a key embedded in a public web page is public.
- **Revoke on suspicion.** If a key might have leaked, revoke it and create a new one. Revoking is instant.

Keys are 32 random bytes, stored as SHA-256 hashes. Open UI can't show you a key again after creation; if you lose one, revoke it and create another.
