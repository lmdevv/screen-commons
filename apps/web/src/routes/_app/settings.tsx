import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { queries } from "../../lib/queries";
import { createKey, revokeKey } from "../../server/functions";

export const Route = createFileRoute("/_app/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.keys()),
  component: Settings,
});

function Settings() {
  const queryClient = useQueryClient();
  const keys = useQuery(queries.keys());
  const [token, setToken] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queries.keys().queryKey });

  const create = useMutation({
    mutationFn: (name: string) => createKey({ data: { name } }),
    onSuccess: async (result) => {
      setToken(result.token);
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeKey({ data: { id } }),
    onSuccess: refresh,
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    create.mutate(String(new FormData(form).get("name")), { onSuccess: () => form.reset() });
  }

  return (
    <main>
      <h1>Settings</h1>
      <h2>API keys</h2>
      <form onSubmit={onSubmit}>
        <label>
          Name <input name="name" required maxLength={60} placeholder="My script" />
        </label>
        <button type="submit" disabled={create.isPending}>
          Create key
        </button>
      </form>
      {create.error ? <p role="alert">{create.error.message}</p> : null}
      {token ? (
        <p>
          New key (copy it now, it won't be shown again):{" "}
          <code data-testid="new-token">{token}</code>
        </p>
      ) : null}
      <ul>
        {keys.data?.items.map((key) => (
          <li key={key.id}>
            {key.name} <code>{key.prefix}…</code> · created{" "}
            {new Date(key.createdAt).toLocaleDateString()} · last used{" "}
            {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "never"}{" "}
            <button type="button" onClick={() => revoke.mutate(key.id)} disabled={revoke.isPending}>
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
