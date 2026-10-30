import type { FlowDetail, ScreenDetail } from "@screen-commons/core";
import { PATTERNS, ELEMENTS, FLOW_TYPES } from "@screen-commons/core/taxonomy";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  Input,
  Textarea,
  FilterChip,
  NativeSelect,
} from "@screen-commons/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { updateScreen, updateFlow, deleteContribution } from "../../server/functions";
import { errorMessage, notify } from "../../lib/toast";

export function ContributionActions({
  item,
  kind,
  onDeleted,
}: {
  item: ScreenDetail | FlowDetail | undefined;
  kind: "screen" | "flow";
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<"edit" | "delete" | null>(null);
  if (!item?.owned) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAction("edit")}>
        Edit contribution
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAction("delete")}>
        Delete contribution
      </Button>
      <Dialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
        {action ? (
          <ContributionForm
            key={`${item.id}:${action}`}
            item={item}
            action={action}
            close={() => setAction(null)}
            saved={async () => {
              setAction(null);
              if (action === "delete") onDeleted();
              await queryClient.invalidateQueries();
            }}
            kind={kind}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function ContributionForm({
  item,
  kind,
  action,
  close,
  saved,
}: {
  item: ScreenDetail | FlowDetail;
  kind: "screen" | "flow";
  action: "edit" | "delete";
  close: () => void;
  saved: () => Promise<void>;
}) {
  const screen = kind === "screen" ? (item as ScreenDetail) : undefined;
  const flow = kind === "flow" ? (item as FlowDetail) : undefined;
  const [title, setTitle] = useState(screen?.title ?? flow?.name ?? "");
  const [patterns, setPatterns] = useState(screen?.patterns ?? []);
  const [elements, setElements] = useState(screen?.elements ?? []);
  const [type, setType] = useState<NonNullable<FlowDetail["type"]> | "">(flow?.type ?? "");
  const [description, setDescription] = useState(flow?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "delete") await deleteContribution({ data: { kind, id: item.id } });
      else if (screen)
        await updateScreen({
          data: {
            id: item.id,
            patch: {
              title: title.trim() || null,
              patterns,
              elements,
            },
          },
        });
      else
        await updateFlow({
          data: {
            id: item.id,
            patch: {
              name: title,
              type: type || null,
              description: description.trim() || null,
            },
          },
        });
      await saved();
      notify.success(action === "delete" ? "Contribution deleted" : "Changes saved");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {action === "edit" ? "Edit contribution" : "Delete contribution?"}
        </DialogTitle>
        <DialogDescription>
          {action === "delete"
            ? "This removes the contribution from the library, saved collections and flows. This cannot be undone."
            : "Update your contribution’s details."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-5">
        {action === "edit" ? (
          <>
            <label className="block space-y-2">
              {screen ? "Title" : "Flow name"}
              <Input
                aria-label={screen ? "Contribution title" : "Contribution flow name"}
                maxLength={screen ? 160 : 80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {screen ? (
              <>
                <fieldset>
                  <legend>Patterns</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PATTERNS.map(({ slug, label }) => (
                      <FilterChip
                        key={slug}
                        selected={patterns.includes(slug)}
                        disabled={!patterns.includes(slug) && patterns.length >= 8}
                        onClick={() =>
                          setPatterns(
                            patterns.includes(slug)
                              ? patterns.filter((p) => p !== slug)
                              : [...patterns, slug],
                          )
                        }
                      >
                        {label}
                      </FilterChip>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>UI elements</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ELEMENTS.map(({ slug, label }) => (
                      <FilterChip
                        key={slug}
                        selected={elements.includes(slug)}
                        disabled={!elements.includes(slug) && elements.length >= 24}
                        onClick={() =>
                          setElements(
                            elements.includes(slug)
                              ? elements.filter((p) => p !== slug)
                              : [...elements, slug],
                          )
                        }
                      >
                        {label}
                      </FilterChip>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : (
              <>
                <label className="block space-y-2">
                  Flow type
                  <NativeSelect
                    aria-label="Contribution flow type"
                    value={type}
                    onValueChange={setType}
                    options={[
                      { value: "", label: "None" },
                      ...FLOW_TYPES.map(({ slug, label }) => ({ value: slug, label })),
                    ]}
                  />
                </label>
                <label className="block space-y-2">
                  Description
                  <Textarea
                    aria-label="Contribution description"
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </>
            )}
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={() => void submit()}
          loading={busy}
          disabled={action === "edit" && !!flow && !title.trim()}
        >
          {action === "delete" ? "Delete contribution" : "Save changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
