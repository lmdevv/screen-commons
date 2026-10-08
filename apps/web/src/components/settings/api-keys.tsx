import type { ApiKey } from "@screen-commons/core";
import {
  Button,
  Callout,
  CodeBlock,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  FieldError,
  Input,
  Label,
  SectionHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  formatDate,
} from "@screen-commons/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";

import { queries } from "../../lib/queries";
import { errorMessage, notify } from "../../lib/toast";
import { createKey, revokeKey } from "../../server/functions";
import { timeAgo } from "./time";

/** API keys: create (token shown once), list, revoke. */
export function ApiKeysSection() {
  const keys = useQuery(queries.keys());
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  return (
    <section aria-labelledby="api-keys-title">
      <SectionHeader
        id="api-keys-title"
        title="API keys"
        description="Keys let scripts, the browser extension and MCP servers act as you."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Create key
          </Button>
        }
      />
      <div className="mt-6">
        {keys.isPending ? (
          <div className="flex flex-col gap-3" aria-busy aria-label="Loading keys">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-control" />
            ))}
          </div>
        ) : keys.data && keys.data.items.length > 0 ? (
          <Table aria-label="API keys">
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Key</TableHeaderCell>
                <TableHeaderCell className="max-sm:hidden">Created</TableHeaderCell>
                <TableHeaderCell className="max-sm:hidden">Last used</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {keys.data.items.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="max-w-48 truncate font-medium">{key.name}</TableCell>
                  <TableCell>
                    <code className="font-mono text-sm text-fg-muted">
                      {key.prefix}
                      <span aria-hidden>••••</span>
                    </code>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-fg-muted max-sm:hidden">
                    {formatDate(key.createdAt)}
                  </TableCell>
                  <TableCell
                    className="text-sm whitespace-nowrap text-fg-muted max-sm:hidden"
                    suppressHydrationWarning
                  >
                    {key.lastUsedAt ? timeAgo(key.lastUsedAt) : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevoking(key)}
                      aria-label={`Revoke ${key.name}`}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            tone="tile"
            size="sm"
            icon={<KeyRound />}
            title="No API keys yet"
            description="Create one for a script, the browser extension or an MCP client."
          />
        )}
      </div>
      <CreateKeyDialog open={creating} onOpenChange={setCreating} />
      <RevokeKeyDialog apiKey={revoking} onClose={() => setRevoking(null)} />
    </section>
  );
}

/** Two states in one dialog: name the key → copy the token (shown once). */
export function CreateKeyDialog({
  open,
  onOpenChange,
  defaultName = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreated?: (token: string) => void;
}) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (name: string) => createKey({ data: { name } }),
    onSuccess: async (result) => {
      setToken(result.token);
      onCreated?.(result.token);
      await queryClient.invalidateQueries({ queryKey: queries.keys().queryKey });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (name) create.mutate(name);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          setToken(null);
          create.reset();
        }
      }}
    >
      <DialogContent size="sm">
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your new key</DialogTitle>
              <DialogDescription>
                Use it as a bearer token: Authorization: Bearer oui_…
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <Callout tone="warning" icon={<TriangleAlert />}>
                This is the only time the key is shown. Store it somewhere safe.
              </Callout>
              <CodeBlock
                code={token}
                data-testid="new-token"
                className="[&_pre]:break-all [&_pre]:whitespace-pre-wrap"
              />
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>Name it after where you’ll use it.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Field name="name" invalid={create.isError}>
                <Label>Name</Label>
                <Input
                  name="name"
                  required
                  maxLength={60}
                  defaultValue={defaultName}
                  placeholder="e.g. Seed script, Claude Code"
                  autoFocus
                  autoComplete="off"
                />
                <FieldError match={create.isError}>
                  {create.error ? errorMessage(create.error) : null}
                </FieldError>
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevokeKeyDialog({ apiKey, onClose }: { apiKey: ApiKey | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [shown, setShown] = useState<ApiKey | null>(apiKey);
  if (apiKey && apiKey !== shown) setShown(apiKey);
  const revoke = useMutation({
    mutationFn: (id: string) => revokeKey({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.keys().queryKey });
      notify.success("Key revoked");
      onClose();
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
  return (
    <Dialog open={apiKey !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Revoke “{shown?.name}”?</DialogTitle>
          <DialogDescription>
            Anything using this key stops working immediately. This can’t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-6">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={revoke.isPending}
            onClick={() => shown && revoke.mutate(shown.id)}
          >
            Revoke key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
