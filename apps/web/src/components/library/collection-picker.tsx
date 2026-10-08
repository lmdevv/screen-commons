/*
 * "Save to collection" dialog (lazy chunk). One item: rows toggle membership (check marks from
 * `getSavedIn`). Several items (bulk selection): a row adds them all. Inline "New collection".
 */
import type { Collection } from "@screen-commons/core";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  cn,
  pluralize,
} from "@screen-commons/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { queries } from "../../lib/queries";
import { errorMessage, notify } from "../../lib/toast";
import { createCollection, saveItem, unsaveItem } from "../../server/functions";
import {
  closeCollectionPicker,
  invalidateSaves,
  setSavedInCaches,
  useCollectionPickerTargets,
  type SaveTarget,
} from "./saving";

export default function CollectionPicker() {
  const targets = useCollectionPickerTargets();
  return (
    <Dialog open={!!targets} onOpenChange={(open) => !open && closeCollectionPicker()}>
      <DialogContent size="sm">{targets ? <PickerBody targets={targets} /> : null}</DialogContent>
    </Dialog>
  );
}

function PickerBody({ targets }: { targets: readonly SaveTarget[] }) {
  const queryClient = useQueryClient();
  const single = targets.length === 1 ? targets[0]! : null;
  const collections = useQuery(queries.collections());
  const savedIn = useQuery({
    ...queries.savedIn(single?.kind ?? "screen", single?.id ?? ""),
    enabled: !!single,
  });
  const [membership, setMembership] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const isMember = (id: string) => membership[id] ?? savedIn.data?.includes(id) ?? false;

  async function toggle(collection: Collection) {
    const add = single ? !isMember(collection.id) : true;
    setBusy(collection.id);
    if (single) setMembership((current) => ({ ...current, [collection.id]: add }));
    try {
      await Promise.all(
        targets.map((target) =>
          (add ? saveItem : unsaveItem)({ data: { ...target, collectionId: collection.id } }),
        ),
      );
      if (single) {
        const stillSaved = (collections.data?.items ?? []).some((item) =>
          item.id === collection.id ? add : isMember(item.id),
        );
        setSavedInCaches(queryClient, single, stillSaved);
      } else {
        for (const target of targets) setSavedInCaches(queryClient, target, true);
        notify.message(`Saved ${pluralize(targets.length, "item")} to ${collection.name}`);
        closeCollectionPicker();
      }
    } catch (error) {
      if (single) setMembership((current) => ({ ...current, [collection.id]: !add }));
      notify.error(errorMessage(error));
    } finally {
      setBusy(null);
      invalidateSaves(queryClient, targets);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const { collection } = await createCollection({ data: { name: trimmed } });
      await Promise.all(
        targets.map((target) => saveItem({ data: { ...target, collectionId: collection.id } })),
      );
      for (const target of targets) setSavedInCaches(queryClient, target, true);
      setMembership((current) => ({ ...current, [collection.id]: true }));
      setName("");
      notify.message(`Saved to ${collection.name}`);
      if (!single) closeCollectionPicker();
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setCreating(false);
      invalidateSaves(queryClient, targets);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {single ? "Save to collection" : `Save ${pluralize(targets.length, "item")}`}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="px-3 pt-4 pb-2">
        {collections.isPending ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner className="text-fg-muted" />
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {collections.data?.items.map((collection) => {
              const member = single ? isMember(collection.id) : false;
              const preview = collection.previews[0];
              return (
                <li key={collection.id}>
                  <button
                    type="button"
                    aria-pressed={single ? member : undefined}
                    disabled={busy === collection.id}
                    onClick={() => void toggle(collection)}
                    className="ou-focus-ring flex h-14 w-full items-center gap-3 rounded-card px-3 text-left transition-colors duration-150 hover:bg-muted disabled:opacity-60"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-tile text-fg-faint">
                      {preview ? (
                        <img
                          src={preview.thumbUrl}
                          alt=""
                          width={40}
                          height={40}
                          className="size-full object-cover object-top"
                        />
                      ) : (
                        <Bookmark aria-hidden className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-fg">
                        {collection.name}
                      </span>
                      <span className="block text-sm text-fg-muted tabular-nums">
                        {pluralize(collection.itemCount, "item")}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full transition-colors duration-150",
                        member ? "bg-inverse text-inverse-fg" : "text-transparent",
                      )}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogBody>
      <DialogFooter className="border-t border-border pt-4">
        <form onSubmit={(event) => void create(event)} className="flex w-full items-center gap-2">
          <Input
            aria-label="New collection name"
            placeholder="New collection"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="secondary" loading={creating} disabled={!name.trim()}>
            <Plus />
            Create
          </Button>
        </form>
      </DialogFooter>
    </>
  );
}
