# Operations and release runbook

## Environment invariants

- Use explicit Alchemy stages: a developer stage for local work, `preview-<number>` for pull
  requests, and `production` only for `main`.
- Each stage owns separate D1, R2, Workflow, Clerk, PostHog, signing, and AI configuration.
- Never copy production secrets into preview configuration or point a preview at a production
  binding. Preview data is disposable.
- Keep `MEDIA_SIGNING_KEY` at 32 random bytes or more. Rotate it to invalidate all outstanding
  five-minute media and upload grants.

## Pre-deploy

1. Run `pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm build`.
2. Review generated D1 migrations. They must be additive or include an explicit forward repair.
3. Confirm the selected Alchemy stage and Cloudflare account before planning or applying changes.
4. Verify required secrets without printing their values.
5. Record the source revision, migration identifiers, and intended stage.

## Smoke test

After deployment verify, with a fresh test account:

1. landing, sign-up, sign-in, protected-route redirect, and sign-out;
2. catalog, search/filter, product view, flow navigation, and signed thumbnail delivery;
3. a standalone draft and ordered-flow draft through conversion and upload;
4. My Submissions state and an expired/tampered upload grant;
5. administrator auto-publication and new-contributor human review;
6. publication appearing in browse/search without a rebuild; and
7. hide, restore, and retry paths.

## Observability and budget

Use the submission correlation ID across application logs, Workflow stages, provider calls, and
review events. Alert on repeated Workflow failure, provider failure, abnormal rejection rate, and
Cloudflare/provider spend. Configure a $25 monthly budget notification. PostHog must use only the
event catalog in `apps/web/src/lib/analytics.ts`; autocapture and replay stay disabled.

## Incident response

- **Unsafe or disputed content:** hide it immediately, preserve the review trail, then investigate.
- **Provider outage:** allow deterministic checks to finish; place work in a retryable failed state.
  Do not bypass human review for new contributors.
- **Workflow failure:** retry the failed idempotent stage with the same correlation ID. Never create
  a replacement submission merely to restart processing.
- **Signing-key exposure:** rotate the key, check logs for unexpected media/upload access, and
  invalidate affected drafts if ownership is uncertain.
- **Cost spike or abuse:** pause new upload grants, retain browsing, inspect per-user limits and
  object operations, and add Turnstile only if measured abuse warrants it.

## Rollback and recovery

Cloudflare can roll the Worker back to the previous version. A Worker rollback does not reverse D1
migrations; apply a reviewed forward repair when schema/data must change. Use D1 Time Travel or the
configured backup process for metadata recovery. Hidden/deleted assets remain recoverable during
the 30-day grace period. Confirm references before purging an R2 object shared by multiple flows.

## Preview cleanup

Destroy the exact `preview-<number>` stage after its pull request closes. Review the plan before
destruction and never use an unresolved variable, wildcard, workspace root, or production stage as
the target. Production R2 is intentionally non-empty and must not use force-destroy behavior.
