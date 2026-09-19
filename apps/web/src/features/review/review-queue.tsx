import { Input } from "@open-ui/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Clock3, Inbox, LoaderCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { SubmissionStatusBadge } from "../contribution/status";
import { serverReviewAdapter } from "./server-review-adapter";
import type { ReviewAdapter, ReviewQueueItem } from "./types";

type QueueFilter = "all" | "flagged" | "failed";

export function ReviewQueue({ adapter = serverReviewAdapter }: { adapter?: ReviewAdapter }) {
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const queueQuery = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => adapter.listQueue(),
  });
  const items: ReviewQueueItem[] = queueQuery.data ?? [];

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "flagged" && item.flagged) ||
        (filter === "failed" && item.status === "processing_failed");
      const matchesQuery =
        !normalizedQuery ||
        `${item.productName} ${item.title} ${item.submitterName}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, items, query]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="mb-2 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Moderation
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Inspect normalized evidence and keep every publication decision in the audit trail.
        </p>
      </div>

      <div className="mb-4 grid gap-3 border bg-card p-3 sm:grid-cols-[1fr_auto]">
        <label className="relative">
          <span className="sr-only">Search review queue</span>
          <Search
            className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search product, flow, or contributor"
            className="pl-8"
          />
        </label>
        <div className="flex gap-1" role="group" aria-label="Queue filters">
          {(["all", "flagged", "failed"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className="border px-3 text-xs text-muted-foreground hover:bg-muted aria-pressed:border-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              {value[0]?.toUpperCase()}
              {value.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {queueQuery.isPending ? (
        <div className="grid min-h-48 place-items-center text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-label="Loading review queue" />
        </div>
      ) : queueQuery.isError ? (
        <div
          role="alert"
          className="border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300"
        >
          {queueQuery.error.message}
        </div>
      ) : visible.length === 0 ? (
        <div className="grid min-h-64 place-items-center border border-dashed text-center">
          <div>
            <Inbox className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-medium">Queue is clear</h2>
            <p className="mt-1 text-xs text-muted-foreground">No submissions match this view.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto border bg-card">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b bg-muted/40 text-[11px] text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Submission
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Contributor
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Age
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {item.flagged ? (
                        <AlertTriangle
                          className="mt-0.5 size-4 shrink-0 text-amber-400"
                          aria-label="Flagged"
                        />
                      ) : null}
                      <div>
                        <div className="font-medium">{item.title}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {item.productName} · {item.itemCount}{" "}
                          {item.itemCount === 1 ? "screen" : "screens"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.submitterName}</td>
                  <td className="px-4 py-3">
                    <SubmissionStatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3" aria-hidden="true" />
                      {item.ageHours < 1 ? "< 1h" : `${item.ageHours}h`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/review/${item.id}`}
                      className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                      aria-label={`Review ${item.title}`}
                    >
                      Review <ArrowRight className="size-3" aria-hidden="true" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Demo reviewer data is local to this browser. Server authorization must gate this route in
        production.
      </p>
    </main>
  );
}
