# Open UI contribution and content policy

This document is the repository source for the contributor terms, privacy summary, and takedown
process displayed by the product. It is an operational MVP policy, not legal advice.

## What contributors may upload

Contributors may submit screenshots they captured lawfully for reference and critique. A submission
must describe its source, product, platform, capture date, product version when known, and one of
these rights statuses:

- `captured-by-contributor`: captured by the contributor from a product they were permitted to use;
- `provided-with-permission`: supplied by a rights holder who permitted this use;
- `public-demo`: captured from a publicly accessible marketing or demonstration experience; or
- `review-required`: provenance is incomplete and publication requires an administrator decision.

Do not upload credentials, authentication tokens, private workspaces, personal messages, financial
or health information, faces or identifiers that are not essential to the UI reference, unlawful or
harmful content, animated images, or material obtained by bypassing access controls. Blur or replace
personal information before upload. Source files are converted in the browser; only the generated
WebP variants are retained.

By submitting, the contributor confirms that the capture and submission are lawful, grants Open UI
permission to host and display the submitted copy for the reference library, and understands that
moderators may edit metadata, reject, hide, or delete it. This does not transfer ownership of the
underlying product interface or marks.

## Code, metadata, and screenshots

Repository code is licensed under Apache-2.0. That license does not automatically apply to the
production database, user accounts, or third-party screenshots. Open UI does not offer a
downloadable screenshot dataset in the MVP. Product names and marks belong to their owners and are
used only to identify the referenced interface.

## Moderation and retention

New-contributor submissions receive automated file, duplicate, safety, and metadata checks followed
by human review. Automated results are signals, not final judgments. Administrators may publish
their own seed material after deterministic checks while still seeing automated warnings.

Authors and administrators can hide material immediately. A deletion request hides content first,
then enters a 30-day recovery period before physical asset removal. Review events and the minimum
records required to handle abuse or takedowns may be retained longer.

## Privacy summary

Open UI uses Clerk for account identity, Cloudflare for compute/database/object storage, PostHog for
explicit product events, and an AI provider for submitted-image safety and metadata suggestions.
Autocapture and session replay are disabled. Analytics must not contain screenshots, credentials,
raw provider responses, or raw search text; search events record only aggregate length and word
count. Operational logs use correlation identifiers and omit signed URLs and image contents.

Account and submission deletion requests use the contact process below. Provider-specific privacy
notices must be linked in the deployed product before public promotion.

## Takedown and privacy requests

Until a dedicated address is configured, repository maintainers receive requests through a private
GitHub security advisory at <https://github.com/lmdevv/open-ui/security/advisories/new>. A request
should include:

1. the affected product, flow, screen, or account and its URL;
2. whether the request concerns rights, privacy, safety, or another issue;
3. the requester's relationship to the material;
4. enough contact information to clarify the request; and
5. the requested resolution.

The maintainer acknowledges a credible request, hides the material when continued display may cause
harm, records the action in the review trail, investigates ownership and scope, and communicates the
decision. Counter-notices and contested legal claims require qualified legal advice rather than an
automated product decision.
