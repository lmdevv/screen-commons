import type { FlowSummary, Screen } from "@open-ui/core";
import { labelFor } from "@open-ui/core/taxonomy";
import {
  AppLogo,
  Badge,
  Button,
  Chip,
  Container,
  DetailList,
  DetailRow,
  EmptyState,
  FlowStrip,
  Kbd,
  PageHeader,
  ScreenImage,
  Skeleton,
  TabNav,
  TabNavItem,
  Textarea,
  cn,
  formatBytes,
  formatDimensions,
  pluralize,
} from "@open-ui/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, CheckCheck, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { queries } from "../../lib/queries";
import { errorMessage, notify } from "../../lib/toast";
import { reviewItem } from "../../server/functions";
import { patternLabel } from "../contribute/model";
import { timeAgo } from "../settings/time";
import type { Contributor, ReviewQueueDetailed } from "./review.functions";
import { reviewQueueQuery } from "./queries";

export type ReviewTab = "screens" | "flows";

const SOURCE_LABELS: Record<Screen["source"], string> = {
  upload: "Website upload",
  extension: "Browser extension",
  mcp: "MCP",
  seed: "Seed",
};
type Item = { kind: "screen"; item: Screen } | { kind: "flow"; item: FlowSummary };

export function ReviewPage({ tab }: { tab: ReviewTab }) {
  const queryClient = useQueryClient();
  const queue = useQuery(reviewQueueQuery());
  const data = queue.data;
  const items: Item[] = data
    ? tab === "screens"
      ? data.screens.map((item) => ({ kind: "screen", item }))
      : data.flows.map((item) => ({ kind: "flow", item }))
    : [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const index = Math.max(
    0,
    items.findIndex((entry) => entry.item.id === selectedId),
  );
  const selected = items[index] ?? null;
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => setRejecting(false), [selected?.item.id]);

  const decide = useMutation({
    mutationFn: (input: { entry: Item; decision: "approve" | "reject"; reason?: string }) =>
      reviewItem({
        data: {
          kind: input.entry.kind,
          id: input.entry.item.id,
          decision: input.decision,
          reason: input.reason || undefined,
        },
      }),
    onMutate: async ({ entry, decision }) => {
      const key = reviewQueueQuery().queryKey;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ReviewQueueDetailed>(key);
      if (previous) {
        // Approving a flow publishes its pending screens too: drop them from the queue.
        const alsoScreens =
          entry.kind === "flow" && decision === "approve"
            ? new Set(previous.flowScreens[entry.item.id] ?? [])
            : new Set<string>();
        queryClient.setQueryData<ReviewQueueDetailed>(key, {
          ...previous,
          screens: previous.screens.filter(
            (s) => !(entry.kind === "screen" && s.id === entry.item.id) && !alsoScreens.has(s.id),
          ),
          flows: previous.flows.filter((f) => !(entry.kind === "flow" && f.id === entry.item.id)),
        });
      }
      // Keep the cursor at the same position: the next item slides into place.
      const next = items[index + 1] ?? items[index - 1] ?? null;
      setSelectedId(next ? next.item.id : null);
      return { previous };
    },
    onSuccess: (_result, { entry, decision }) => {
      const noun = entry.kind === "screen" ? "Screen" : "Flow";
      notify.success(decision === "approve" ? `${noun} approved` : `${noun} rejected`);
      // Library grids, app pages and counts all change.
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "review",
      });
    },
    onError: (error, _input, context) => {
      if (context?.previous)
        queryClient.setQueryData(reviewQueueQuery().queryKey, context.previous);
      notify.error(errorMessage(error));
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: queries.reviewQueue().queryKey }),
  });

  const approve = () => selected && decide.mutate({ entry: selected, decision: "approve" });
  const reject = (reason?: string) =>
    selected && decide.mutate({ entry: selected, decision: "reject", reason });

  // J/K move, A approve, R reject. Ignored while typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const key = event.key.toLowerCase();
      if (key === "j" || key === "k") {
        event.preventDefault();
        const next = items[key === "j" ? index + 1 : index - 1];
        if (next) setSelectedId(next.item.id);
      } else if (key === "a" && selected) {
        event.preventDefault();
        approve();
      } else if (key === "r" && selected) {
        event.preventDefault();
        setRejecting(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const counts = { screens: data?.screens.length ?? 0, flows: data?.flows.length ?? 0 };

  return (
    <Container className="pt-10 pb-24 sm:pt-12">
      <PageHeader
        title="Review"
        description="Contributions from members wait here. Approved items publish immediately."
        actions={
          <p className="hidden items-center gap-3 text-sm text-fg-muted lg:flex">
            <span className="flex items-center gap-1.5">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> move
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>A</Kbd> approve
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>R</Kbd> reject
            </span>
          </p>
        }
      />
      <TabNav aria-label="Review queue" className="mt-5">
        {(["screens", "flows"] as const).map((value) => (
          <TabNavItem
            key={value}
            active={tab === value}
            badge={
              counts[value] > 0 ? (
                <Badge tone={tab === value ? "inverse" : "neutral"} className="tabular-nums">
                  {counts[value]}
                </Badge>
              ) : null
            }
            render={
              <Link to="/review" search={value === "screens" ? {} : { tab: value }} replace />
            }
          >
            {value === "screens" ? "Screens" : "Flows"}
          </TabNavItem>
        ))}
      </TabNav>

      <div className="mt-8">
        {queue.isPending ? (
          <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]" aria-busy>
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[76px] rounded-card" />
              ))}
            </div>
            <Skeleton className="hidden aspect-[16/10] rounded-tile lg:block" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            tone="tile"
            icon={<CheckCheck />}
            title="All caught up"
            description={
              tab === "screens"
                ? "No screens are waiting for review."
                : "No flows are waiting for review."
            }
            actions={
              (tab === "screens" ? counts.flows : counts.screens) > 0 ? (
                <Button
                  variant="outline"
                  render={
                    <Link to="/review" search={tab === "screens" ? { tab: "flows" } : {}} replace />
                  }
                >
                  Review{" "}
                  {tab === "screens"
                    ? pluralize(counts.flows, "flow")
                    : pluralize(counts.screens, "screen")}
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <ul aria-label="Pending items" className="flex flex-col gap-1.5">
              {items.map((entry) => (
                <li key={entry.item.id}>
                  <QueueRow
                    entry={entry}
                    contributor={data?.contributors[entry.item.id]}
                    active={entry.item.id === selected?.item.id}
                    onSelect={() => setSelectedId(entry.item.id)}
                  />
                </li>
              ))}
            </ul>
            {selected ? (
              <div className="max-lg:order-first lg:sticky lg:top-[calc(var(--spacing-topbar)+24px)]">
                <ItemDetail
                  key={selected.item.id}
                  entry={selected}
                  contributor={data?.contributors[selected.item.id]}
                  position={{ index, total: items.length }}
                  rejecting={rejecting}
                  onRejectingChange={setRejecting}
                  onApprove={approve}
                  onReject={reject}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Container>
  );
}

function QueueRow({
  entry,
  contributor,
  active,
  onSelect,
}: {
  entry: Item;
  contributor?: Contributor;
  active: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(active);
  useEffect(() => {
    // Follow keyboard navigation (J/K) without scrolling the page on first render.
    if (active && !wasActive.current) ref.current?.scrollIntoView({ block: "nearest" });
    wasActive.current = active;
  }, [active]);
  const thumb = entry.kind === "screen" ? entry.item : entry.item.previews[0];
  const title = entry.kind === "screen" ? (entry.item.title ?? "Untitled screen") : entry.item.name;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "ou-focus-ring flex w-full items-center gap-3 rounded-card p-2 pr-3 text-left transition-colors duration-150",
        active ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      <span className="relative h-[60px] w-24 shrink-0 overflow-hidden rounded-shot bg-tile after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_var(--color-shot-border)]">
        {thumb ? (
          <img
            src={thumb.thumbUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover object-top"
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-base font-medium text-fg">{title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
          <AppLogo app={entry.item.app} size="xs" />
          <span className="truncate">{entry.item.app.name}</span>
          {entry.kind === "flow" ? (
            <span className="shrink-0">· {pluralize(entry.item.stepCount, "step")}</span>
          ) : null}
        </span>
        <span className="truncate text-xs text-fg-subtle" suppressHydrationWarning>
          {contributor?.name ?? "Unknown"} · {timeAgo(entry.item.createdAt)}
        </span>
      </span>
    </button>
  );
}

function ItemDetail({
  entry,
  contributor,
  position,
  rejecting,
  onRejectingChange,
  onApprove,
  onReject,
}: {
  entry: Item;
  contributor?: Contributor;
  position: { index: number; total: number };
  rejecting: boolean;
  onRejectingChange: (rejecting: boolean) => void;
  onApprove: () => void;
  onReject: (reason?: string) => void;
}) {
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (rejecting) reasonRef.current?.focus();
  }, [rejecting]);

  const { item } = entry;
  const title = entry.kind === "screen" ? (entry.item.title ?? "Untitled screen") : entry.item.name;

  return (
    <article aria-label={`Reviewing ${title}`} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg-muted tabular-nums">
            {position.index + 1} of {position.total}
          </p>
          <h2 className="mt-1 text-lg font-semibold break-words text-fg">{title}</h2>
          <p className="mt-1 flex items-center gap-2 text-base text-fg-muted">
            <AppLogo app={item.app} size="xs" />
            <span className="truncate">{item.app.name}</span>
            <span aria-hidden>·</span>
            <span>{labelFor(item.app.platform)}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => onRejectingChange(true)} aria-keyshortcuts="R">
            <X />
            Reject
          </Button>
          <Button onClick={onApprove} aria-keyshortcuts="A">
            <Check />
            Approve
          </Button>
        </div>
      </div>

      {rejecting ? (
        <form
          className="flex flex-col gap-3 rounded-card border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onReject(reason.trim());
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onRejectingChange(false);
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onReject(reason.trim());
            }
          }}
        >
          <label htmlFor="reject-reason" className="text-sm font-medium text-fg">
            Reason{" "}
            <span className="font-normal text-fg-subtle">(optional, kept with the item)</span>
          </label>
          <Textarea
            id="reject-reason"
            ref={reasonRef}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Duplicate of an existing screen, or contains personal data"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onRejectingChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" size="sm">
              Reject {entry.kind}
            </Button>
          </div>
        </form>
      ) : null}
      {entry.kind === "screen" ? (
        <div className="max-h-[58dvh] overflow-y-auto rounded-tile bg-tile p-5 ou-scrollbar-thin sm:p-8">
          <ScreenImage
            src={entry.item.imageUrl}
            width={entry.item.width}
            height={entry.item.height}
            platform={entry.item.app.platform}
            layout="natural"
            alt={title}
            priority
            className={entry.item.app.platform === "web" ? "" : "mx-auto max-w-80"}
          />
        </div>
      ) : (
        <FlowPreview flow={entry.item} />
      )}
      {entry.kind === "screen" && entry.item.patterns.length + entry.item.elements.length > 0 ? (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {entry.item.patterns.map((slug) => (
            <Chip key={slug} tone="soft">
              {patternLabel(slug)}
            </Chip>
          ))}
          {entry.item.elements.map((slug) => (
            <Chip key={slug} tone="outline">
              {labelFor(slug)}
            </Chip>
          ))}
        </div>
      ) : null}

      <DetailList>
        <DetailRow label="Contributor">
          {contributor ? (
            <span title={contributor.email}>
              {contributor.name} <span className="text-fg-muted">· {contributor.email}</span>
            </span>
          ) : (
            "Deleted account"
          )}
        </DetailRow>
        <DetailRow label="Submitted">
          <span suppressHydrationWarning>{timeAgo(item.createdAt)}</span>
        </DetailRow>
        {entry.kind === "screen" ? (
          <>
            <DetailRow label="Size">
              {formatDimensions(entry.item.width, entry.item.height)} ·{" "}
              {formatBytes(entry.item.bytes)}
            </DetailRow>
            <DetailRow label="Source">{SOURCE_LABELS[entry.item.source]}</DetailRow>
            {entry.item.sourceUrl ? (
              <DetailRow label="URL">
                <a
                  href={entry.item.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ou-focus-ring inline-flex max-w-full items-center gap-1 rounded-xs hover:underline"
                >
                  <span className="truncate">
                    {entry.item.sourceUrl.replace(/^https?:\/\//u, "")}
                  </span>
                  <ExternalLink aria-hidden className="size-3.5 shrink-0" />
                </a>
              </DetailRow>
            ) : null}
            {entry.item.version ? (
              <DetailRow label="Version">{entry.item.version}</DetailRow>
            ) : null}
          </>
        ) : (
          <>
            <DetailRow label="Type">{entry.item.type ? labelFor(entry.item.type) : "—"}</DetailRow>
            <DetailRow label="Steps">{entry.item.stepCount}</DetailRow>
          </>
        )}
      </DetailList>
    </article>
  );
}

function FlowPreview({ flow }: { flow: FlowSummary }) {
  const detail = useQuery(queries.flow(flow.id));
  return (
    <div className="rounded-tile bg-tile py-6">
      {detail.data ? (
        <FlowStrip
          steps={detail.data.steps}
          size="md"
          aria-label={`${flow.name} steps`}
          className="px-6"
        />
      ) : (
        <div className="flex gap-4 overflow-hidden px-6">
          {flow.previews.map((preview) => (
            <div key={preview.id} className="w-[min(70vw,360px)] shrink-0">
              <ScreenImage
                src={preview.thumbUrl}
                width={preview.width}
                height={preview.height}
                platform={flow.app.platform}
                alt=""
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
