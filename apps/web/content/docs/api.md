---
title: REST API
description: Authenticate, read the catalog, upload screens and flows, and manage collections and keys over HTTP.
order: 7
section: Integrations
---

The REST API is what the website, the extension, the MCP servers and the seed scripts use. Everything they can do, you can do with an API key.

```text
https://<your-instance>/api/v1
```

Locally, that's `http://localhost:5173/api/v1`. Request and response bodies are JSON unless noted.

## Authentication

| Method         | How                          | Works from                                                 |
| -------------- | ---------------------------- | ---------------------------------------------------------- |
| API key        | `Authorization: Bearer sc_…` | Anywhere: scripts, servers, extensions, other websites.    |
| Session cookie | Signed in on the website     | Same-origin requests from the Screen Commons website only. |

```bash
curl http://localhost:5173/api/v1/me \
  -H "Authorization: Bearer sc_…"
```

```json
{
  "id": "DhuNSXNJaqBg8QINunSTH5nUZfmJktEn",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "image": null,
  "role": "admin",
  "createdAt": "2026-10-07T03:57:29.405Z"
}
```

A key acts as the user who created it, with the same role. See [API keys](/docs/api-keys).

Cross-origin requests may use bearer keys from any origin (`Access-Control-Allow-Origin: *`). Cookies are ignored on cross-origin requests, so a third-party site can't act as a signed-in user.

Every endpoint requires authentication except [`GET /taxonomy`](#taxonomy). API responses are never cached (`Cache-Control: private, no-store`).

## Errors

Errors use HTTP status codes and a JSON body:

```json
{
  "error": {
    "code": "not_found",
    "message": "Screen not found"
  }
}
```

| Code                     | Status | Meaning                                                                          |
| ------------------------ | ------ | -------------------------------------------------------------------------------- |
| `bad_request`            | 400    | Invalid input. `error.details` lists the validation issues.                      |
| `unauthorized`           | 401    | Missing, unknown or revoked key, and no session.                                 |
| `forbidden`              | 403    | Authenticated, but not allowed. For example, a member calling a review endpoint. |
| `not_found`              | 404    | The item doesn't exist or you can't see it.                                      |
| `conflict`               | 409    | Reserved. Not returned by the current release.                                   |
| `payload_too_large`      | 413    | Request body or an image is over its limit.                                      |
| `unsupported_media_type` | 415    | An image isn't a complete PNG, JPEG or WebP, or isn't the type it's declared as. |
| `rate_limited`           | 429    | Reserved. The current release has no rate limits.                                |
| `internal`               | 500    | Something went wrong on the server.                                              |
| `unavailable`            | 503    | A dependency failed, e.g. a thumbnail couldn't be generated. Retry later.        |

Hidden items return `404`, not `403`, so the API doesn't reveal what exists.

## Pagination

List endpoints return a page and a cursor:

```json
{ "items": [], "nextCursor": "WyJsYXRlc3QiLDE3OTE..." }
```

Pass `nextCursor` back as `cursor` to get the next page. `null` means there are no more items. Cursors are opaque and tied to the `sort` they were created with.

| Parameter | Default | Range             |
| --------- | ------- | ----------------- |
| `limit`   | 30      | 1–100             |
| `cursor`  | none    | From `nextCursor` |

`sort` is `latest` (newest first, the default) or `popular`. Popularity is saves × 4 + views; for apps it also includes their published screens' scores.

## Visibility

Lists and search return published items plus your own pending items. Fetching one item by id or slug also returns it if you contributed it, whatever its status. Admins can fetch any item and see everyone's pending items through [`GET /review`](#list-the-review-queue).

## Taxonomy

### Get the taxonomy

```http
GET /api/v1/taxonomy
```

Public. Returns the valid slugs for every filter.

```json
{
  "platforms": [
    { "slug": "web", "label": "Web" },
    { "slug": "ios", "label": "iOS" },
    { "slug": "android", "label": "Android" }
  ],
  "categories": [
    { "slug": "ai", "label": "AI" },
    { "slug": "developer-tools", "label": "Developer Tools" }
  ],
  "patterns": [
    { "slug": "landing", "label": "Landing" },
    { "slug": "pricing", "label": "Pricing" }
  ],
  "elements": [
    { "slug": "pricing-table", "label": "Pricing Table" },
    { "slug": "toggle", "label": "Toggle" }
  ],
  "flowTypes": [
    { "slug": "onboarding", "label": "Onboarding" },
    { "slug": "signing-up", "label": "Signing Up" }
  ]
}
```

Lists are shortened here. The full taxonomy has 3 platforms, 20 categories, 30 patterns, 43 UI elements and 16 flow types.

## Apps

### List apps

```http
GET /api/v1/apps
```

| Parameter  | Type   | Description                             |
| ---------- | ------ | --------------------------------------- |
| `platform` | string | `web`, `ios` or `android`.              |
| `category` | string | Category slug.                          |
| `q`        | string | Full-text search, up to 200 characters. |
| `sort`     | string | `latest` or `popular`.                  |
| `cursor`   | string | Pagination cursor.                      |
| `limit`    | number | 1–100, default 30.                      |

```bash
curl "http://localhost:5173/api/v1/apps?platform=web&limit=2" \
  -H "Authorization: Bearer sc_…"
```

```json
{
  "items": [
    {
      "id": "01m4a893k000004qxv975nt1xs",
      "slug": "acme",
      "name": "Acme",
      "platform": "web",
      "logoUrl": null,
      "accentColor": null,
      "tagline": "Project tracking for small teams",
      "category": "productivity",
      "websiteUrl": "https://acme.example",
      "screenCount": 3,
      "flowCount": 1,
      "previews": [
        {
          "id": "01m4a897qf0000wvmz496jx0t7",
          "thumbUrl": "/media/thumb/aedb95fd36e102bbd1a56571cebe14bb192a368966cb117c949dba9e170e5c14.png",
          "width": 640,
          "height": 400
        }
      ],
      "status": "published",
      "updatedAt": "2026-10-07T03:59:58.187Z"
    }
  ],
  "nextCursor": null
}
```

`previews` holds up to three recent screen thumbnails.

### Get an app

```http
GET /api/v1/apps/{slug}
```

Accepts a slug or an id. Slugs are unique per platform; when a slug exists on several platforms, `web` wins unless you pass `?platform=ios` or `?platform=android`.

Returns the app summary plus `description`, `versions` (newest first), pattern and element counts, and `createdAt`:

```json
{
  "id": "01m4a893k000004qxv975nt1xs",
  "slug": "acme",
  "name": "Acme",
  "platform": "web",
  "screenCount": 3,
  "flowCount": 1,
  "description": null,
  "versions": ["Oct 2026"],
  "patterns": [
    { "slug": "dashboard", "count": 1 },
    { "slug": "pricing", "count": 1 },
    { "slug": "signup", "count": 1 }
  ],
  "elements": [
    { "slug": "form", "count": 1 },
    { "slug": "pricing-table", "count": 1 }
  ],
  "createdAt": "2026-10-07T03:59:53.952Z"
}
```

Summary fields are omitted above for brevity.

## Screens

### List screens

```http
GET /api/v1/screens
```

| Parameter  | Type   | Description                                         |
| ---------- | ------ | --------------------------------------------------- |
| `app`      | string | App slug or id.                                     |
| `platform` | string | `web`, `ios` or `android`.                          |
| `pattern`  | string | Pattern slug, such as `pricing`.                    |
| `element`  | string | UI element slug, such as `pricing-table`.           |
| `version`  | string | Version label, such as `Oct 2026`.                  |
| `q`        | string | Full-text search, including text in the screenshot. |
| `sort`     | string | `latest` or `popular`.                              |
| `cursor`   | string | Pagination cursor.                                  |
| `limit`    | number | 1–100, default 30.                                  |

```bash
curl "http://localhost:5173/api/v1/screens?pattern=pricing&limit=1" \
  -H "Authorization: Bearer sc_…"
```

```json
{
  "items": [
    {
      "id": "01m4a893kc0000j5p41fk1kn1d",
      "app": {
        "id": "01m4a893k000004qxv975nt1xs",
        "slug": "acme",
        "name": "Acme",
        "platform": "web",
        "logoUrl": null,
        "accentColor": null
      },
      "title": "Choose a plan",
      "imageUrl": "/media/img/300254a0afb0dad8a4b43bd1ad079f097c787534b42c871b651347b9f1bfdf32.png",
      "thumbUrl": "/media/thumb/d7ed8e5985b41369bd56cb891e76f52d155193b96b76f53f7d0880e7dd7b7ec6.png",
      "width": 1440,
      "height": 900,
      "bytes": 515809,
      "sourceUrl": "https://acme.example/pricing",
      "patterns": ["pricing"],
      "elements": ["pricing-table", "toggle"],
      "tags": [],
      "version": "Oct 2026",
      "dominantColor": null,
      "status": "published",
      "source": "extension",
      "saved": false,
      "capturedAt": "2026-10-07T03:59:53.964Z",
      "createdAt": "2026-10-07T03:59:53.952Z"
    }
  ],
  "nextCursor": null
}
```

`saved` is `true` when the screen is in any of your collections. `source` is `upload`, `extension`, `mcp` or `seed`.

### Get a screen

```http
GET /api/v1/screens/{id}
```

Returns the screen plus its neighbours in the app (for previous and next navigation) and the flows it belongs to:

```json
{
  "id": "01m4a893kc0000j5p41fk1kn1d",
  "title": "Choose a plan",
  "previousId": "01m4a897qf0000wvmz496jx0t7",
  "nextId": "01m4a893k40000pe41ccc98d40",
  "flows": [
    { "id": "01m4a893kc0001kwg7288ksy74", "name": "Sign up and pick a plan", "position": 1 }
  ]
}
```

Screen fields from the list example are omitted above.

### Upload a screen

```http
POST /api/v1/screens
Content-Type: multipart/form-data
```

| Part        | Type | Description                                        |
| ----------- | ---- | -------------------------------------------------- |
| `image`     | file | Full-size PNG, JPEG or WebP.                       |
| `thumbnail` | file | 640 px wide thumbnail you generated, ideally WebP. |
| `meta`      | JSON | Screen metadata and the app (below).               |

Images are typed and sized from their bytes, never from file names or declared types. The thumbnail must be a top crop of the image: no wider than the image (or 1280 px), and no taller than the image's own aspect or 9:19.5. The server stores the display image as WebP (see [Media](#media)): send WebP if you can, otherwise the server converts PNG and JPEG for you.

`meta` fields:

| Field           | Type     | Required | Notes                                                                                                      |
| --------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `app`           | object   | Yes      | `name` (required), `slug`, `websiteUrl`, `platform` (default `web`), `category`, `tagline`, `description`. |
| `width`         | number   | Yes      | Image width in pixels, up to 4096.                                                                         |
| `height`        | number   | Yes      | Image height in pixels, up to 20,000.                                                                      |
| `title`         | string   | No       | Up to 160 characters.                                                                                      |
| `sourceUrl`     | string   | No       | Page URL the screen was captured from.                                                                     |
| `patterns`      | string[] | No       | Up to 8 pattern slugs.                                                                                     |
| `elements`      | string[] | No       | Up to 24 UI element slugs.                                                                                 |
| `tags`          | string[] | No       | Up to 16, each up to 40 characters.                                                                        |
| `version`       | string   | No       | Defaults to the capture month, such as `Oct 2026`.                                                         |
| `dominantColor` | string   | No       | Hex color, such as `#0a0a0a`.                                                                              |
| `capturedAt`    | string   | No       | ISO 8601 timestamp. Defaults to now.                                                                       |
| `text`          | string   | No       | Visible text on the screen, up to 20,000 characters. Indexed for search.                                   |
| `source`        | string   | No       | Defaults to `upload`.                                                                                      |

```bash
curl http://localhost:5173/api/v1/screens \
  -H "Authorization: Bearer sc_…" \
  -F image=@dashboard.png \
  -F thumbnail=@dashboard-thumb.webp \
  -F 'meta={"app":{"name":"Acme","websiteUrl":"https://acme.example"},"title":"Dashboard","sourceUrl":"https://acme.example/app","patterns":["dashboard"],"elements":["table","side-navigation"],"width":1440,"height":900}'
```

Returns `201 Created` with `{ "screen": Screen }`. The server reads the real type and dimensions from the file headers; `width` and `height` must not exceed the limits.

The app is matched by slug, then website domain, then a slug of the name, on the same platform. If none match, it's created. Uploading an image that's already in the app returns the existing screen.

## Captures

### Upload a batch

```http
POST /api/v1/captures
```

Upload up to 50 screens of one app in a single JSON request, optionally as a flow. Images are base64 without a `data:` prefix. This is the endpoint the extension, the MCP server and the seed script use.

| Field     | Type     | Required | Notes                                                                                                                              |
| --------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `app`     | object   | Yes      | Same as `meta.app` above.                                                                                                          |
| `screens` | object[] | Yes      | 1–50 screens. Each has the `meta` fields above (except `app` and `source`), plus `image`, `thumbnail` and an optional `stepLabel`. |
| `logo`    | object   | No       | App logo, `{ "type", "base64" }`, up to 512 KiB and 1024×1024.                                                                     |
| `flow`    | object   | No       | `name` (required), `type`, `description`. Screens become steps in order.                                                           |
| `source`  | string   | No       | Defaults to `extension`.                                                                                                           |

```json
{
  "app": {
    "name": "Acme",
    "websiteUrl": "https://acme.example",
    "platform": "web",
    "category": "productivity",
    "tagline": "Project tracking for small teams"
  },
  "screens": [
    {
      "image": { "type": "image/png", "base64": "iVBORw0KGgo…" },
      "thumbnail": { "type": "image/webp", "base64": "UklGR…" },
      "width": 1440,
      "height": 900,
      "title": "Sign up",
      "sourceUrl": "https://acme.example/signup",
      "patterns": ["signup"],
      "elements": ["form", "text-field"],
      "text": "Create your account Email Password",
      "stepLabel": "Create account"
    },
    {
      "image": { "type": "image/png", "base64": "iVBORw0KGgo…" },
      "thumbnail": { "type": "image/webp", "base64": "UklGR…" },
      "width": 1440,
      "height": 900,
      "title": "Choose a plan",
      "sourceUrl": "https://acme.example/pricing",
      "patterns": ["pricing"],
      "elements": ["pricing-table", "toggle"],
      "text": "Simple pricing Starter Pro Billed yearly",
      "stepLabel": "Pick a plan"
    }
  ],
  "flow": { "name": "Sign up and pick a plan", "type": "signing-up" }
}
```

Response, `201 Created`:

```json
{
  "app": {
    "id": "01m4a893k000004qxv975nt1xs",
    "slug": "acme",
    "name": "Acme",
    "platform": "web",
    "logoUrl": null,
    "accentColor": null
  },
  "screens": [
    {
      "id": "01m4a893k40000pe41ccc98d40",
      "status": "published",
      "url": "http://localhost:5173/screens/01m4a893k40000pe41ccc98d40"
    },
    {
      "id": "01m4a893kc0000j5p41fk1kn1d",
      "status": "published",
      "url": "http://localhost:5173/screens/01m4a893kc0000j5p41fk1kn1d"
    }
  ],
  "flow": {
    "id": "01m4a893kc0001kwg7288ksy74",
    "status": "published",
    "url": "http://localhost:5173/flows/01m4a893kc0001kwg7288ksy74"
  }
}
```

A batch must stay under 28 MiB of decoded images and 40 MiB of raw request body. Split larger uploads into several batches; to keep them in one app, pass the `slug` returned by the first batch as `app.slug`, then create the flow with [`POST /flows`](#create-a-flow).

## Flows

### List flows

```http
GET /api/v1/flows
```

| Parameter  | Type   | Description                           |
| ---------- | ------ | ------------------------------------- |
| `app`      | string | App slug or id.                       |
| `platform` | string | `web`, `ios` or `android`.            |
| `type`     | string | Flow type slug, such as `signing-up`. |
| `q`        | string | Full-text search.                     |
| `cursor`   | string | Pagination cursor.                    |
| `limit`    | number | 1–100, default 30.                    |

Flows are listed newest first.

```json
{
  "items": [
    {
      "id": "01m4a893kc0001kwg7288ksy74",
      "app": {
        "id": "01m4a893k000004qxv975nt1xs",
        "slug": "acme",
        "name": "Acme",
        "platform": "web",
        "logoUrl": null,
        "accentColor": null
      },
      "name": "Sign up and pick a plan",
      "type": "signing-up",
      "description": null,
      "stepCount": 2,
      "previews": [
        {
          "id": "01m4a893k40000pe41ccc98d40",
          "thumbUrl": "/media/thumb/04bf01b3e2e658ae12349c6e7456d7059b31081ee8c8d6f2364477f7eff4ec44.png",
          "width": 640,
          "height": 400
        }
      ],
      "status": "published",
      "saved": false,
      "createdAt": "2026-10-07T03:59:53.952Z"
    }
  ],
  "nextCursor": null
}
```

### Get a flow

```http
GET /api/v1/flows/{id}
```

Returns the flow summary plus `steps`, ordered by `position`, each with a full screen object:

```json
{
  "id": "01m4a893kc0001kwg7288ksy74",
  "name": "Sign up and pick a plan",
  "type": "signing-up",
  "stepCount": 2,
  "steps": [
    {
      "position": 0,
      "label": "Create account",
      "screen": { "id": "01m4a893k40000pe41ccc98d40", "title": "Sign up" }
    },
    {
      "position": 1,
      "label": "Pick a plan",
      "screen": { "id": "01m4a893kc0000j5p41fk1kn1d", "title": "Choose a plan" }
    }
  ]
}
```

Screen objects are shortened above. Steps only include screens you're allowed to see.

### Create a flow

```http
POST /api/v1/flows
```

Order existing screens of one app into a flow.

```bash
curl http://localhost:5173/api/v1/flows \
  -H "Authorization: Bearer sc_…" \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "01m4a893k000004qxv975nt1xs",
    "name": "Upgrade",
    "type": "upgrading",
    "steps": [
      { "screenId": "01m4a897qf0000wvmz496jx0t7", "label": "Dashboard" },
      { "screenId": "01m4a893kc0000j5p41fk1kn1d", "label": "Plans" }
    ]
  }'
```

| Field         | Type     | Required | Notes                                                                  |
| ------------- | -------- | -------- | ---------------------------------------------------------------------- |
| `appId`       | string   | Yes      | The app's id.                                                          |
| `name`        | string   | Yes      | Up to 80 characters.                                                   |
| `type`        | string   | No       | Flow type slug.                                                        |
| `description` | string   | No       | Up to 500 characters.                                                  |
| `steps`       | object[] | Yes      | 2–60 `{ screenId, label? }`, in order. Screens must belong to the app. |

Returns `201 Created` with `{ "flow": FlowDetail }`. The flow is published only if an admin creates it and every screen is published; otherwise it's `pending`.

## Search

```http
GET /api/v1/search
```

| Parameter  | Type   | Description                         |
| ---------- | ------ | ----------------------------------- |
| `q`        | string | Required. 1–200 characters.         |
| `platform` | string | `web`, `ios` or `android`.          |
| `limit`    | number | Results per group, 1–30, default 8. |

Returns apps, screens and flows ranked by relevance, plus taxonomy terms whose label matches the query:

```bash
curl "http://localhost:5173/api/v1/search?q=pricing" \
  -H "Authorization: Bearer sc_…"
```

```json
{
  "apps": [],
  "screens": [{ "id": "01m4a893kc0000j5p41fk1kn1d", "title": "Choose a plan" }],
  "flows": [],
  "terms": [
    { "kind": "pattern", "slug": "pricing", "label": "Pricing" },
    { "kind": "element", "slug": "pricing-table", "label": "Pricing Table" }
  ]
}
```

Every word must match, as a prefix. If nothing matches all the words, results matching any word are returned instead. Screen search covers titles, app names, patterns, elements, tags, source URLs and the screen's `text`.

## Collections and saves

### List collections

```http
GET /api/v1/collections
```

Your collections, default first. The default **Saved** collection is created on first use.

```json
{
  "items": [
    {
      "id": "01m4a89thd00008r21tya8c2kc",
      "name": "Saved",
      "isDefault": true,
      "itemCount": 1,
      "previews": [
        {
          "thumbUrl": "/media/thumb/d7ed8e5985b41369bd56cb891e76f52d155193b96b76f53f7d0880e7dd7b7ec6.png"
        }
      ],
      "createdAt": "2026-10-07T04:00:17.453Z"
    }
  ]
}
```

### Create, read, rename and delete

| Request                           | Body                          | Response                                                                              |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `POST /api/v1/collections`        | `{ "name": "Pricing pages" }` | `201` `{ "collection": Collection }`                                                  |
| `GET /api/v1/collections/{id}`    | —                             | `{ "collection", "screens": Screen[], "flows": FlowSummary[], "apps": AppSummary[] }` |
| `PATCH /api/v1/collections/{id}`  | `{ "name": "…" }`             | `{ "collection": Collection }`                                                        |
| `DELETE /api/v1/collections/{id}` | —                             | `204`. The default collection can't be deleted.                                       |

Names are 1–60 characters.

### Save and unsave

```bash
# Save a screen to your default collection
curl -X POST http://localhost:5173/api/v1/saves \
  -H "Authorization: Bearer sc_…" \
  -H "Content-Type: application/json" \
  -d '{"kind":"screen","id":"01m4a893kc0000j5p41fk1kn1d"}'

# Remove it from every collection
curl -X DELETE "http://localhost:5173/api/v1/saves?kind=screen&id=01m4a893kc0000j5p41fk1kn1d" \
  -H "Authorization: Bearer sc_…"
```

| Request                                 | Parameters                                                      | Response |
| --------------------------------------- | --------------------------------------------------------------- | -------- |
| `POST /api/v1/saves`                    | Body: `kind` (`screen`, `flow` or `app`), `id`, `collectionId?` | `204`    |
| `DELETE /api/v1/saves`                  | Query: `kind`, `id`, `collectionId?`                            | `204`    |
| `POST /api/v1/collections/{id}/items`   | Body: `kind`, `id`                                              | `204`    |
| `DELETE /api/v1/collections/{id}/items` | Query: `kind`, `id`                                             | `204`    |

Saving is idempotent. Without `collectionId`, saves go to the default collection and unsaves remove the item from all your collections.

## API keys

Session only: these endpoints reject API keys with `403`, so a leaked key can't mint more keys. See [API keys](/docs/api-keys).

| Request                    | Body                      | Response                                   |
| -------------------------- | ------------------------- | ------------------------------------------ |
| `GET /api/v1/keys`         | —                         | `{ "items": ApiKey[] }`, active keys only  |
| `POST /api/v1/keys`        | `{ "name": "My script" }` | `201` `{ "key": ApiKey, "token": "sc_…" }` |
| `DELETE /api/v1/keys/{id}` | —                         | `204`                                      |

```json
{
  "key": {
    "id": "01m4a84pg400008dgkvzs0w1be",
    "name": "My script",
    "prefix": "sc_qy9o",
    "lastUsedAt": null,
    "createdAt": "2026-10-07T03:57:29.476Z"
  },
  "token": "sc_qy9o2hBoJ_6aRZUVHwtX-P0hJb-WuAr7nfzTf68TZBg"
}
```

`token` is returned only once, at creation.

## Review

Admin only. Members get `403`.

### List the review queue

```http
GET /api/v1/review
```

Returns up to 100 pending screens and 100 pending flows, oldest first:

```json
{ "screens": [], "flows": [] }
```

### Approve or reject

```http
POST /api/v1/review/{kind}/{id}
```

`kind` is `screen` or `flow`.

```bash
curl -X POST http://localhost:5173/api/v1/review/screen/01m4a8ae3z0000yfr7j15phk4b \
  -H "Authorization: Bearer sc_…" \
  -H "Content-Type: application/json" \
  -d '{"decision":"approve"}'
```

| Field      | Type   | Required | Notes                  |
| ---------- | ------ | -------- | ---------------------- |
| `decision` | string | Yes      | `approve` or `reject`. |
| `reason`   | string | No       | Up to 500 characters.  |

Returns `204`. See [Review](/docs/contributing#review) for what each decision changes.

### Backfill display media

```http
POST /api/v1/admin/media/backfill
```

Admin only. Processes one page of screens whose display media predates the current [display policy](/docs/architecture#display-images), oldest id first. Run `pnpm media:backfill --url … --key sc_…` to page through all of them.

| Field    | Type    | Required | Notes                                                   |
| -------- | ------- | -------- | ------------------------------------------------------- |
| `limit`  | number  | No       | 1–50, default 10.                                       |
| `cursor` | string  | No       | `nextCursor` from the previous page.                    |
| `dryRun` | boolean | No       | List what would be processed without changing anything. |

```json
{
  "items": [
    {
      "screenId": "01m4a8ae3z0000yfr7j15phk4b",
      "action": "updated",
      "imageKey": "img/9c1f….v1.webp",
      "thumbKey": "thumb/9c1f….v1-desktop.webp"
    }
  ],
  "nextCursor": null,
  "remaining": 0
}
```

`action` is `updated`, `current` (already met the policy, only marked), `failed` (left for the next run, with a `reason`) or `pending` (dry run).

## Media

`imageUrl`, `thumbUrl`, `logoUrl` and preview URLs are relative paths on your instance:

```text
/media/img/<sha256>.webp
/media/img/<sha256>.v1.webp
/media/thumb/<sha256>.webp
/media/thumb/<sha256>.v1-desktop.webp
/media/logo/<sha256>.png
```

Prefix them with the instance origin. Keys are SHA-256 hashes of the file contents, so a URL never changes meaning. `.v1` keys are display images the server derived from an upload under display policy version 1. They are addressed by the hash of the uploaded source, so the same upload always maps to the same derivative. A policy change produces new keys, never new bytes at an old URL. Display images are WebP except in two cases: when WebP wouldn't be smaller than the uploaded PNG or JPEG, or when the server couldn't convert the upload yet. Retained originals are never served.

| Media referenced by              | Who can fetch it                                  | Caching                                                 |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Published content                | Anyone with the URL, no auth needed               | `public, max-age=31536000, immutable`, `ETag`, CORS `*` |
| Only pending or rejected content | The contributor and admins (cookie or bearer key) | `private, no-store`                                     |
| Nothing                          | Nobody (`404`)                                    | —                                                       |

`GET` and `HEAD` are supported, and `If-None-Match` returns `304`.

## Limits

| Limit                                                                      | Value                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Request body, upload endpoints (`POST /screens`, `POST /captures`, `/mcp`) | 40 MiB                                                                     |
| Request body, everything else                                              | 1 MiB                                                                      |
| Full-size image                                                            | 15 MiB, 4096 × 20,000 px; displayed at up to 16,383 px tall (WebP's limit) |
| Thumbnail                                                                  | 1 MiB, up to 1280 px wide                                                  |
| Logo                                                                       | 512 KiB, 1024 × 1024 px                                                    |
| Decoded images per request                                                 | 28 MiB                                                                     |
| Screens per batch                                                          | 50                                                                         |
| Steps per flow                                                             | 2–60                                                                       |
| Page size                                                                  | default 30, max 100                                                        |

Bodies are measured as they stream in; `Content-Length` isn't trusted.

## TypeScript client

`@screen-commons/core` ships a typed client for browsers, Workers, Node and extensions. It's a workspace package in this repository, not published to npm; depend on it with `"@screen-commons/core": "workspace:*"` inside the monorepo.

```ts
import { ScreenCommonsApiError, createScreenCommonsClient } from "@screen-commons/core";

const client = createScreenCommonsClient({
  baseUrl: "http://localhost:5173",
  apiKey: process.env.SCREEN_COMMONS_API_KEY,
});

const { items, nextCursor } = await client.listScreens({
  pattern: "pricing",
  element: "toggle",
  limit: 12,
});
for (const screen of items) console.log(screen.app.name, screen.title, screen.thumbUrl);

try {
  await client.review("screen", "01m4a8ae3z0000yfr7j15phk4b", "approve");
} catch (error) {
  if (error instanceof ScreenCommonsApiError && error.code === "forbidden") {
    console.log("Only admins can review");
  }
}
```

Omit `apiKey` to use the session cookie from same-origin browser code.

| Method                                                                           | Endpoint                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| `me()`                                                                           | `GET /me`                                   |
| `taxonomy()`                                                                     | `GET /taxonomy`                             |
| `listApps(query)` / `getApp(slug)`                                               | `GET /apps`, `GET /apps/{slug}`             |
| `listScreens(query)` / `getScreen(id)`                                           | `GET /screens`, `GET /screens/{id}`         |
| `listFlows(query)` / `getFlow(id)`                                               | `GET /flows`, `GET /flows/{id}`             |
| `search(query)`                                                                  | `GET /search`                               |
| `createScreen({ image, thumbnail, meta })`                                       | `POST /screens`                             |
| `captures(batch)`                                                                | `POST /captures`                            |
| `createFlow(input)`                                                              | `POST /flows`                               |
| `listCollections()` / `getCollection(id)`                                        | `GET /collections`, `GET /collections/{id}` |
| `createCollection(name)` / `renameCollection(id, name)` / `deleteCollection(id)` | `POST`, `PATCH`, `DELETE /collections`      |
| `save(kind, id, collectionId?)` / `unsave(kind, id, collectionId?)`              | `POST /saves`, `DELETE /saves`              |
| `listKeys()` / `createKey(name)` / `revokeKey(id)`                               | `/keys` (session only)                      |
| `reviewQueue()` / `review(kind, id, decision, reason?)`                          | `GET /review`, `POST /review/{kind}/{id}`   |

Request and response types (`Screen`, `FlowDetail`, `CaptureBatchInput`, …) are exported from the same package. Failed requests throw `ScreenCommonsApiError` with `status`, `code`, `message` and `details`.
