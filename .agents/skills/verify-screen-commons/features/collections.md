# Collections

Members save screens, flows and apps to private collections, see them at `/saved`, and manage those collections. Everyone has a default collection named `Saved` that can't be deleted.

## Sub-features

- `collections-save` saves a screen from the viewer and creates a new collection in the picker.
- `collections-list` lists collections at `/saved` and items inside each.
- `collections-key` saves and unsaves with the `S` key on a screen page.
- `collections-rest` saves an item with `POST /api/v1/saves`.
- `collections-default` protects the default collection from deletion.
- `collections-delete` deletes a collection.

## How to get to it (user POV)

- Choose `Save` in the screen viewer, then `Add to collection` (driven).
- Press `S` on `/screens/<id>` (driven). `S` inside the viewer is not scripted.
- Open `/saved` from the address bar (driven). The top bar link `Saved` and `G` then `S` are not scripted.
- Call `POST /api/v1/saves` (driven, for an app, with the session cookie). With an API key is not scripted.
- Choose `Save` on an app page or a flow viewer (not scripted).
- Choose `Rename` on a collection page (not scripted).

## Driving it with control.mjs

Preconditions:

- `control doctor --run <id>` is healthy.
- The journey signs up its own member, who starts with an empty `Saved`.

Run `control drive collections --run <id>`, which performs these steps.

- **Save and create.** Open `/browse/web?tab=screens&screen=<id>`. Choose button `Save`, whose `aria-pressed` goes from `false`, then button `Add to collection`. In dialog `Save to collection`, fill `New collection name` and choose `Create`. The new collection's button appears with `aria-pressed="true"`. D1 has a `collection_item` row for that collection.
- **List.** Press `Escape` twice, open `/saved`, and choose the collection's link. Its name is a heading, and `main [data-screen-id="<id>"]` is listed.
- **Save by key.** Open `/screens/<second id>` and press `s`. `aria-pressed` becomes `true`, and D1 places the item in `Saved`.
- **Unsave by key.** Press `s` again. `aria-pressed` becomes `false` and the D1 row is gone.
- **REST.** `POST /api/v1/saves` with `{ "kind": "app", "id": "<app id>" }` from the signed-in page returns 204, and D1 has the row.
- **Default.** In `main` on `/saved`, choose the link starting with `Saved`. Text `Default` appears and no button `Delete collection` exists.
- **Delete.** Open the created collection, choose button `Delete collection`, and confirm with the same name in the dialog. The URL returns to `/saved` and the link is gone. D1 still places the first screen in `Saved`.
- **Proof.** Read `test-results/verify/<run>/collections-*/result.json` and the `collection items` JSON files.

## Gotchas

- Saving always puts the item in `Saved`, and adding it to a collection is a second action. Deleting that collection leaves the `Saved` copy, so don't assert the item became unsaved.
- The top bar also has a link named `Saved`. Scope to `main` when you mean the collection.
- `aria-pressed` updates optimistically. Read D1 or REST for proof the save landed.
- Cookie-authenticated REST calls need a same-origin request. A page's `page.request` qualifies; plain `fetch` with no cookie gets a 401.
