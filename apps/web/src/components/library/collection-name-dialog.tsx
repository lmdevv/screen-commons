/* Create / rename a collection (lazy chunk). */
import type { Collection } from "@screen-commons/core";
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Label,
} from "@screen-commons/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { errorMessage, notify } from "../../lib/toast";
import { createCollection, renameCollection } from "../../server/functions";

export default function CollectionNameDialog({
  mode,
  collection,
  open,
  onOpenChange,
}: {
  mode: "create" | "rename";
  collection?: Pick<Collection, "id" | "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(collection?.name ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setName(collection?.name ?? "");
  }, [open, collection?.name]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    try {
      if (mode === "create") {
        const { collection: created } = await createCollection({ data: { name: trimmed } });
        await queryClient.invalidateQueries({ queryKey: ["collections"] });
        onOpenChange(false);
        void navigate({ to: "/saved/$id", params: { id: created.id } });
      } else if (collection) {
        await renameCollection({ data: { id: collection.id, name: trimmed } });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["collections"] }),
          queryClient.invalidateQueries({ queryKey: ["collection", collection.id] }),
        ]);
        onOpenChange(false);
        notify.message("Collection renamed");
      }
    } catch (error) {
      notify.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "New collection" : "Rename collection"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Field>
              <Label>Name</Label>
              <Input
                autoFocus
                value={name}
                maxLength={60}
                placeholder="Onboarding inspiration"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" type="button" />}>Cancel</DialogClose>
            <Button type="submit" loading={pending} disabled={!name.trim()}>
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
