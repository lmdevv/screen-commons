import type { ScreenDetail } from "@open-ui/core";
import {
  AppLogo,
  Button,
  Container,
  ScreenDetails,
  ScreenImage,
  Tooltip,
  cn,
  frameKind,
  textLinkClassName,
  useHotkey,
} from "@open-ui/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Link2,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import {
  copyImageToClipboard,
  copyText,
  downloadScreen,
} from "../../components/library/image-actions";
import { useSaveToggle } from "../../components/library/saving";
import { withDisplayTitle } from "../../lib/display-title";
import { queries } from "../../lib/queries";
import { usePagePlatform } from "../../lib/use-current-platform";
import { errorMessage, notify } from "../../lib/toast";

export const Route = createFileRoute("/_app/screens/$id")({
  loader: async ({ context: { queryClient }, params }) => {
    const screen = await queryClient.ensureQueryData(queries.screen(params.id));
    return { title: screen.title ? `${screen.title} — ${screen.app.name}` : screen.app.name };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.title} — Open UI` : "Open UI" }],
  }),
  component: ScreenPage,
});

/** Standalone, SSR'd screen page (shareable link): same content as the viewer overlay. */
function ScreenPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(queries.screen(id));
  const screen = useMemo(() => withDisplayTitle(data), [data]);
  usePagePlatform(screen.app.platform);
  const navigate = useNavigate();
  const toggleSave = useSaveToggle();
  const overlayOpen = Route.useSearch({ select: (s) => !!s.screen || !!s.flow });
  const mobile = frameKind(screen.app.platform) === "mobile";

  const go = (target: string | null) =>
    target && void navigate({ to: "/screens/$id", params: { id: target } });
  useHotkey("ArrowLeft", () => go(screen.previousId), { mod: false, enabled: !overlayOpen });
  useHotkey("ArrowRight", () => go(screen.nextId), { mod: false, enabled: !overlayOpen });
  useHotkey("s", () => void toggleSave({ kind: "screen", id: screen.id }, !screen.saved), {
    mod: false,
    enabled: !overlayOpen,
  });

  const copyImage = async () => {
    try {
      await copyImageToClipboard(screen.imageUrl);
      notify.message("Image copied to clipboard");
    } catch (error) {
      notify.error(errorMessage(error));
    }
  };
  useCopyShortcut(copyImage, !overlayOpen);

  return (
    <Container className="pt-8 pb-24 sm:pt-10">
      <Link
        to="/apps/$slug"
        params={{ slug: screen.app.slug }}
        className={cn(textLinkClassName, "inline-flex items-center gap-1.5 no-underline")}
      >
        <ArrowLeft className="size-4" />
        {screen.app.name}
      </Link>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex min-w-0 items-center gap-3 text-lg font-semibold text-fg">
          <AppLogo app={screen.app} size="md" />
          <span className="truncate">
            {screen.app.name}
            {screen.title ? (
              <span className="font-normal text-fg-muted">
                <span className="text-fg-faint"> / </span>
                {screen.title}
              </span>
            ) : null}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <NeighbourButton id={screen.previousId} direction="prev" />
          <NeighbourButton id={screen.nextId} direction="next" />
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <Tooltip content="Copy image" shortcut="⌘C">
            <Button variant="ghost" icon aria-label="Copy image" onClick={() => void copyImage()}>
              <Copy />
            </Button>
          </Tooltip>
          <Tooltip content="Download">
            <Button
              variant="ghost"
              icon
              aria-label="Download"
              onClick={() =>
                downloadScreen(screen).catch((e: unknown) => notify.error(errorMessage(e)))
              }
            >
              <Download />
            </Button>
          </Tooltip>
          <Tooltip content="Copy link">
            <Button
              variant="ghost"
              icon
              aria-label="Copy link"
              onClick={() =>
                copyText(location.href)
                  .then(() => notify.message("Link copied"))
                  .catch((e: unknown) => notify.error(errorMessage(e)))
              }
            >
              <Link2 />
            </Button>
          </Tooltip>
          <Button
            variant={screen.saved ? "secondary" : "primary"}
            aria-pressed={screen.saved}
            onClick={() => void toggleSave({ kind: "screen", id: screen.id }, !screen.saved)}
          >
            <Bookmark className={cn(screen.saved && "fill-current")} />
            {screen.saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-tile bg-tile px-4 py-6 md:px-12 md:py-10">
          <ScreenImage
            src={screen.imageUrl}
            width={screen.width}
            height={screen.height}
            platform={screen.app.platform}
            alt={
              screen.title ? `${screen.title} — ${screen.app.name}` : `${screen.app.name} screen`
            }
            layout="natural"
            priority
            placeholderColor={screen.dominantColor}
            className={cn("mx-auto", mobile ? "max-w-[420px]" : "max-w-[1200px]")}
          />
        </div>
        <aside className="lg:sticky lg:top-[calc(var(--spacing-topbar)+24px)] lg:self-start">
          <ScreenDetails
            screen={screen}
            className="p-0 md:p-0"
            appLinkRender={<Link to="/apps/$slug" params={{ slug: screen.app.slug }} />}
            tagLinkRender={(kind, slug) => (
              <Link
                to="/browse/$platform"
                params={{ platform: screen.app.platform }}
                search={
                  kind === "pattern"
                    ? { tab: "screens", pattern: slug as never }
                    : { tab: "elements", element: slug as never }
                }
              />
            )}
            flowLinkRender={(flow: ScreenDetail["flows"][number]) => (
              <Link to="/flows/$id" params={{ id: flow.id }} />
            )}
          />
        </aside>
      </div>
    </Container>
  );
}

function NeighbourButton({ id, direction }: { id: string | null; direction: "prev" | "next" }) {
  const label = direction === "prev" ? "Previous screen" : "Next screen";
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  if (!id) {
    return (
      <Button variant="ghost" icon aria-label={label} disabled>
        <Icon />
      </Button>
    );
  }
  return (
    <Tooltip content={label} shortcut={direction === "prev" ? "←" : "→"}>
      <Button
        variant="ghost"
        icon
        aria-label={label}
        render={<Link to="/screens/$id" params={{ id }} />}
      >
        <Icon />
      </Button>
    </Tooltip>
  );
}

/** ⌘/Ctrl+C copies the image unless text is selected or focus is in a field. */
function useCopyShortcut(copy: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || !(event.metaKey || event.ctrlKey) || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (window.getSelection()?.toString()) return;
      event.preventDefault();
      copy();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copy, enabled]);
}
