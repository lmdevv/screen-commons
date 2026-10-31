# Contribute and review

Anyone with an account uploads screens at `/contribute`, optionally as an ordered flow. A member's upload waits in the admin's `/review` queue, an admin's publishes immediately, and owners can edit or delete their contributions.

## Sub-features

- `contribute-intake` adds images by file picker, drop and paste, encoded to WebP in the browser.
- `contribute-app` creates a new app or joins an existing one.
- `contribute-flow` names a flow and labels its steps.
- `contribute-pending` keeps a member's upload pending and hidden from other users.
- `review-access` returns 404 at `/review` for members.
- `review-approve` publishes a flow, its screens and its app with the `A` key.
- `review-reject` rejects with a reason using the `R` key.
- `contribute-edit` lets the owner edit a contribution.
- `contribute-delete` lets the owner delete a contribution.
- `contribute-admin` publishes an admin's upload immediately.

## How to get to it (user POV)

- Choose `Contribute` in the top bar (driven), or press `G` then `C` (driven).
- Choose `Contribute` in the account menu, in the palette, on an app page or on an empty Discover (not scripted).
- Choose files in the dropzone (driven), drop files on it (driven), or paste anywhere on the page (driven). Pressing `Enter` or `Space` on the dropzone is not scripted.
- Upload through `POST /api/v1/captures` (driven only by the seed at launch). `upload_screen` and `capture_pages` over MCP are driven in [Remote MCP](./mcp-remote.md) and [Local MCP](./mcp-local.md). `POST /api/v1/screens` and the extension's own tray are not scripted.
- Open `/review` as an admin (driven), or press `G` then `R` (not scripted).
- Choose `Edit contribution` or `Delete contribution` on a screen page you own (driven), or in a viewer or on a flow you own (not scripted).
- Reorder flow steps by drag or keyboard (not scripted; `apps/web/e2e/keyboard.e2e.ts` covers the keyboard).
- Review with buttons, or with `J` and `K` (not scripted).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- The journey signs up its own member and uses the seed admin. It creates a new app named `Verify App <stamp>`.

Run `control drive contribute --run <id>`, which performs these steps.

- **Validation.** On `/sign-up`, choose `Create account` with empty fields. `Enter your name.` appears.
- **Open.** Sign up. Press `g`, wait for status `Go to`, and press `c`, or choose banner link `Contribute`. Level 1 heading `Contribute` appears.
- **Intake.** `setInputFiles` on `input[type="file"]` shows `1 screen ready`. A `drop` on its parent shows `2 screens ready`. A `paste` on the body shows `3 screens ready`.
- **App.** Choose `Continue`, fill `Search apps` with the new name, choose option `Create “<name>”`, fill `Website`, and choose `Continue`.
- **Flow.** Choose switch `Save as a flow` and `Continue`. `Name the flow.` appears. Fill `Flow name`, select `signing-up` in `Flow type`, fill `Step label for screen 1` to `3`, and choose `Continue`.
- **Submit as member.** `Members’ uploads are reviewed by an admin` appears. Choose `Submit 3 screens`. Heading `Submitted for review` appears.
- **Pending state.** Link `View flow` holds the app slug and flow id. Over REST as the member, the flow is `pending` with the 3 labels in order. D1 agrees, and the new app is `pending` too. The screen's image URL matches `/media/img/<64 hex>.webp` and is served as `image/webp`.
- **Access.** `GET /review` as the member returns 404. The admin's `flows` listing doesn't include the pending flow. Another member gets 404 for the flow, its screen and its app, and 200 for the flow and app after approval.
- **Approve.** As the admin, on `/review`, choose the link starting `Flows`, then the flow's button in list `Pending items`. Article `Reviewing <flow>` appears. Press `a`. `Flow approved` appears. D1 shows the flow and app `published`, REST shows each screen `published`, and the flow is on `/apps/<slug>?tab=flows`.
- **Join an app.** As the member, upload 2 screens with no flow, choosing the app's option in `Search apps`, then `Submit 2 screens`.
- **Reject.** As the admin, `/review` lists 2 buttons naming this app. Choose the first, press `r`, fill the field labeled `Reason`, and press `Enter`. `Screen rejected` appears and only one of those buttons remains. D1 shows `status = rejected` and the `review_reason`.
- **Edit.** As the member, on `/screens/<a screen from the flow>`, choose `Edit contribution`, fill `Contribution title`, and choose `Save changes`. `Changes saved` appears, and REST returns the new title.
- **Delete.** On the remaining pending screen, choose `Delete contribution` and confirm in the dialog. `Contribution deleted` appears and the D1 row is gone.
- **Admin upload.** As the admin, upload 1 screen with `Publish 1 screen`. Heading `Published` appears, and D1 shows the admin's screen `published`.
- **Proof.** Read `test-results/verify/<run>/contribute-*/result.json`, the D1 JSON files, and the screenshots for submit, approve and the app page.

## Gotchas

- Drop and paste are real page events carrying real `File` objects, but they are dispatched by script. They exercise the app's handlers, not the operating system's drag or clipboard.
- A key pressed immediately after the sign-up redirect was lost in testing. Use `h.goto` first so the page is settled, and wait for status `Go to` between `g` and its second key.
- Identical bytes in one app return the existing screen. Use `h.pngs`, whose images carry the drive's stamp, rather than reusing a file.
- Other journeys leave pending items in the queue, including `mcp-local`. Find rows by your own stamped app name, never by position or total count.
- `/review` needs the seed admin. A member gets a 404, not a redirect.
- Approval publishes the app for good, and members can't delete accounts. On this disposable instance that's fine; teardown removes it.
