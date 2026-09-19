# Architecture

This scaffold implements the foundation agreed in the Open UI Reference Library architecture
design dated 2026-09-18.

## System boundary

TanStack Start is the only application and backend. It will serve pre-rendered marketing and blog
routes, the authenticated client-rendered library, server functions, API and media routes, and the
Cloudflare Workflow entry point.

Cloudflare D1 is authoritative for metadata, permissions, submission state, search indexes, and
audit records. Private R2 will hold immutable full-size and thumbnail WebP variants. Clerk provides
identity; local D1 records remain authoritative for roles and ownership. One durable Cloudflare
Workflow per submission will coordinate deterministic validation, duplicate checks, AI adapters,
retries, and optional human review.

## Repository boundaries

- `apps/web`: the TanStack Start deployable, including media and workflow code
- `packages/domain`: framework-independent entities, schemas, policies, and publication decisions
- `packages/db`: Drizzle schema, migrations, queries, and FTS maintenance
- `packages/ui`: shared UI primitives and design tokens
- `packages/config`: shared TypeScript and tooling configuration
- `packages/infra`: Cloudflare resources and deployment definitions

Effect belongs only at operational boundaries: moderation workflows, provider adapters, D1/R2
services, typed operational failures, and retry classification. UI code and ordinary route handlers
should remain idiomatic TypeScript.

## Delivery rules

- `main` is the production branch; pull requests must pass lint, formatting, type, and build checks.
- Preview resources must never read or mutate production D1, R2, Clerk, or analytics data.
- Database migrations must be additive or include a forward repair because application rollback
  does not reverse database state.
- Secrets and binding values are never committed; checked-in `.env.schema` files document them.

## Deliberate deferrals

R2 bindings, Workflows, PostHog, hotkeys, media signing, moderation adapters, and product-domain
tables are added with their corresponding vertical slice—not as unused bootstrap dependencies.
Search starts with D1 FTS5. Redis, vector search, a separate API service, queues, Sentry, Datadog,
transactional email, a public API, CLI, browser extension, and MCP are outside the MVP.

The architecture should change only in response to measured limits or validated product demand.
