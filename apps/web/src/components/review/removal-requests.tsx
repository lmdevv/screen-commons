import { Button } from "@screen-commons/ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listRemovalRequests, reviewRemoval } from "../../server/functions";
import { errorMessage, notify } from "../../lib/toast";

export function RemovalRequests() {
  const queryClient = useQueryClient();
  const requests = useQuery({
    queryKey: ["review", "removal-requests"],
    queryFn: () => listRemovalRequests(),
  });
  const decide = useMutation({
    mutationFn: (data: { kind: "screen" | "flow"; id: string; remove: boolean }) =>
      reviewRemoval({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      notify.success("Removal request reviewed");
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
  if (requests.isError)
    return (
      <p role="alert" className="mt-5 text-sm text-danger">
        Removal requests couldn’t be loaded.{" "}
        <Button variant="ghost" size="sm" onClick={() => void requests.refetch()}>
          Retry
        </Button>
      </p>
    );
  if (!requests.data?.length) return null;
  return (
    <section className="mt-6 space-y-3" aria-label="Removal requests">
      <h2 className="font-semibold">Removal requests</h2>
      {requests.data.map((item) => (
        <div
          key={`${item.kind}:${item.id}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-4"
        >
          <div>
            <Link
              to={item.kind === "screen" ? "/screens/$id" : "/flows/$id"}
              params={{ id: item.id }}
              className="font-medium underline"
            >
              {item.title ?? item.kind} · {item.appName}
            </Link>
            <p className="text-sm text-fg-muted">{item.reason}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ kind: item.kind, id: item.id, remove: false })}
            >
              Keep contribution
            </Button>
            <Button
              size="sm"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ kind: item.kind, id: item.id, remove: true })}
            >
              Approve removal
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
