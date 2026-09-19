import { useQuery } from "@tanstack/react-query";

import { mediaUrlQueryOptions } from "./queries";
import type { LibraryScreen, PreviewKind } from "./types";

export function UiPreview({
  screen,
  className = "",
  compact = false,
}: {
  screen: Pick<LibraryScreen, "preview" | "accent" | "title" | "imageKey">;
  className?: string;
  compact?: boolean;
}) {
  const mediaQuery = useQuery(mediaUrlQueryOptions(screen.imageKey));

  if (mediaQuery.data) {
    return (
      <div className={`relative overflow-hidden bg-[#e9e9e5] dark:bg-[#252523] ${className}`}>
        <img
          src={mediaQuery.data}
          alt={`${screen.title} interface preview`}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden bg-[#e9e9e5] p-[5%] dark:bg-[#252523] ${className}`}
      aria-label={`${screen.title} interface preview`}
      role="img"
    >
      <div className="h-full w-full overflow-hidden rounded-[4px] bg-white shadow-[0_12px_35px_rgba(30,30,25,0.16)] dark:bg-[#171716] dark:shadow-[0_12px_35px_rgba(0,0,0,0.32)]">
        <PreviewChrome accent={screen.accent} compact={compact} />
        <PreviewBody kind={screen.preview} accent={screen.accent} compact={compact} />
      </div>
    </div>
  );
}

function PreviewChrome({ accent, compact }: { accent: string; compact: boolean }) {
  return (
    <div
      className={`flex items-center border-b border-black/6 px-[5%] dark:border-white/6 ${compact ? "h-[10%]" : "h-[8%]"}`}
    >
      <div className="flex gap-[3px]">
        <i className="size-[3px] rounded-full bg-black/18 dark:bg-white/18" />
        <i className="size-[3px] rounded-full bg-black/18 dark:bg-white/18" />
        <i className="size-[3px] rounded-full bg-black/18 dark:bg-white/18" />
      </div>
      <span className="ml-[8%] h-[28%] w-[28%] rounded-full bg-black/6 dark:bg-white/7" />
      <span className="ml-auto size-[5px] rounded-sm" style={{ backgroundColor: accent }} />
    </div>
  );
}

function PreviewBody({
  kind,
  accent,
  compact,
}: {
  kind: PreviewKind;
  accent: string;
  compact: boolean;
}) {
  if (kind === "inbox") return <InboxPreview accent={accent} />;
  if (kind === "checkout") return <CheckoutPreview accent={accent} />;
  if (kind === "calendar") return <CalendarPreview accent={accent} />;
  if (kind === "music") return <MusicPreview accent={accent} />;
  if (kind === "travel") return <TravelPreview accent={accent} />;
  if (kind === "editor") return <EditorPreview accent={accent} />;
  if (kind === "settings") return <SettingsPreview accent={accent} />;
  return <AnalyticsPreview accent={accent} compact={compact} />;
}

function SideRail({ accent }: { accent: string }) {
  return (
    <div className="w-[17%] border-r border-black/5 bg-black/[0.025] p-[6%_3%] dark:border-white/5 dark:bg-white/[0.025]">
      <span
        className="mb-[22%] block h-[6px] w-[72%] rounded"
        style={{ backgroundColor: accent }}
      />
      {[0, 1, 2, 3, 4].map((item) => (
        <span
          key={item}
          className="mb-[14%] block h-[3px] rounded-full bg-black/8 dark:bg-white/9"
          style={{ width: `${62 + (item % 3) * 11}%` }}
        />
      ))}
    </div>
  );
}

function AnalyticsPreview({ accent, compact }: { accent: string; compact: boolean }) {
  return (
    <div className="flex h-[92%]">
      <SideRail accent={accent} />
      <div className="flex-1 p-[5%]">
        <div className="flex items-center justify-between">
          <span className="h-[6px] w-[31%] rounded bg-black/12 dark:bg-white/13" />
          <span className="h-[12px] w-[18%] rounded-sm" style={{ backgroundColor: accent }} />
        </div>
        <div className="mt-[6%] grid grid-cols-3 gap-[3%]">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-sm border border-black/6 p-[8%] dark:border-white/7">
              <span className="block h-[3px] w-[62%] rounded bg-black/8 dark:bg-white/10" />
              <span className="mt-[12%] block h-[7px] w-[45%] rounded bg-black/15 dark:bg-white/16" />
            </div>
          ))}
        </div>
        <div className="mt-[4%] flex h-[45%] items-end gap-[3%] rounded-sm bg-black/[0.025] px-[5%] pb-[5%] dark:bg-white/[0.025]">
          {[42, 68, 52, 82, 64, 92, 74, 88].slice(0, compact ? 6 : 8).map((height, index) => (
            <i
              key={index}
              className="flex-1 rounded-t-[2px] opacity-70"
              style={{ height: `${height}%`, backgroundColor: accent }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function InboxPreview({ accent }: { accent: string }) {
  return (
    <div className="flex h-[92%]">
      <SideRail accent={accent} />
      <div className="w-[31%] border-r border-black/6 p-[4%_2%] dark:border-white/6">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="mb-[7%] flex gap-[6%]">
            <i
              className="size-[9px] shrink-0 rounded-full"
              style={{
                backgroundColor:
                  item === 0 ? accent : "color-mix(in srgb, currentColor 12%, transparent)",
              }}
            />
            <span className="w-full">
              <i className="block h-[3px] w-[78%] rounded bg-black/13 dark:bg-white/13" />
              <i className="mt-[5%] block h-[2px] w-full rounded bg-black/6 dark:bg-white/7" />
            </span>
          </div>
        ))}
      </div>
      <div className="flex-1 p-[5%]">
        <span className="block h-[6px] w-[46%] rounded bg-black/13 dark:bg-white/14" />
        <span className="mt-[3%] block h-[3px] w-[24%] rounded bg-black/7 dark:bg-white/8" />
        <div className="mt-[10%] space-y-[4%]">
          {[88, 96, 65].map((width) => (
            <i
              key={width}
              className="block h-[3px] rounded bg-black/7 dark:bg-white/8"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
        <div className="mt-[16%] h-[27%] rounded-sm border border-black/8 p-[4%] dark:border-white/8">
          <i className="block h-[3px] w-[40%] rounded bg-black/7 dark:bg-white/8" />
          <i
            className="mt-[18%] ml-auto block h-[10px] w-[24%] rounded-sm"
            style={{ backgroundColor: accent }}
          />
        </div>
      </div>
    </div>
  );
}

function CheckoutPreview({ accent }: { accent: string }) {
  return (
    <div className="grid h-[92%] grid-cols-[1.3fr_.7fr] gap-[6%] p-[7%]">
      <div>
        <span className="block h-[7px] w-[45%] rounded bg-black/14 dark:bg-white/14" />
        {["78%", "100%", "100%"].map((width, index) => (
          <div key={width + index} className="mt-[8%]">
            <i className="block h-[3px] w-[28%] rounded bg-black/7 dark:bg-white/8" />
            <i
              className="mt-[3%] block h-[13px] rounded-sm border border-black/8 dark:border-white/8"
              style={{ width }}
            />
          </div>
        ))}
        <i
          className="mt-[8%] block h-[14px] w-full rounded-sm"
          style={{ backgroundColor: accent }}
        />
      </div>
      <div className="rounded-sm bg-black/[0.035] p-[9%] dark:bg-white/[0.04]">
        <span className="block h-[5px] w-[68%] rounded bg-black/12 dark:bg-white/13" />
        {[0, 1, 2].map((item) => (
          <span key={item} className="mt-[14%] flex justify-between">
            <i className="h-[3px] w-[44%] rounded bg-black/7 dark:bg-white/8" />
            <i className="h-[3px] w-[22%] rounded bg-black/10 dark:bg-white/11" />
          </span>
        ))}
      </div>
    </div>
  );
}

function CalendarPreview({ accent }: { accent: string }) {
  return (
    <div className="flex h-[92%]">
      <SideRail accent={accent} />
      <div className="flex-1 p-[5%]">
        <div className="flex justify-between">
          <i className="h-[6px] w-[27%] rounded bg-black/12 dark:bg-white/13" />
          <i className="h-[11px] w-[17%] rounded-sm" style={{ backgroundColor: accent }} />
        </div>
        <div className="mt-[6%] grid h-[70%] grid-cols-5 border-l border-t border-black/7 dark:border-white/7">
          {Array.from({ length: 20 }).map((_, item) => (
            <i key={item} className="border-r border-b border-black/7 p-[8%] dark:border-white/7">
              {[3, 8, 11, 17].includes(item) ? (
                <b
                  className="block h-[55%] rounded-[2px] opacity-55"
                  style={{ backgroundColor: accent }}
                />
              ) : null}
            </i>
          ))}
        </div>
      </div>
    </div>
  );
}

function MusicPreview({ accent }: { accent: string }) {
  return (
    <div
      className="h-[92%] p-[7%] text-center"
      style={{
        background: `linear-gradient(145deg, color-mix(in srgb, ${accent} 20%, transparent), transparent 55%)`,
      }}
    >
      <div
        className="mx-auto mt-[4%] aspect-square w-[34%] rounded-sm opacity-85"
        style={{ background: `linear-gradient(135deg, ${accent}, #302a4f)` }}
      />
      <i className="mx-auto mt-[6%] block h-[6px] w-[35%] rounded bg-black/14 dark:bg-white/15" />
      <i className="mx-auto mt-[3%] block h-[3px] w-[22%] rounded bg-black/7 dark:bg-white/9" />
      <div className="mx-auto mt-[8%] flex w-[55%] items-center justify-between">
        <i className="size-[6px] rounded-full bg-black/18 dark:bg-white/20" />
        <i
          className="grid size-[19px] place-items-center rounded-full"
          style={{ backgroundColor: accent }}
        >
          <b className="ml-[1px] h-0 w-0 border-y-[3px] border-l-[5px] border-y-transparent border-l-white" />
        </i>
        <i className="size-[6px] rounded-full bg-black/18 dark:bg-white/20" />
      </div>
    </div>
  );
}

function TravelPreview({ accent }: { accent: string }) {
  return (
    <div className="h-[92%] p-[5%]">
      <div
        className="relative h-[47%] overflow-hidden rounded-sm"
        style={{
          background: `linear-gradient(145deg, ${accent}88, ${accent}18), linear-gradient(35deg, #243448, #a9c4c1)`,
        }}
      >
        <i className="absolute left-[7%] top-[14%] h-[8px] w-[42%] rounded bg-white/80" />
        <i className="absolute bottom-[12%] left-[7%] h-[16px] w-[62%] rounded-sm bg-white/88" />
      </div>
      <div className="mt-[5%] grid grid-cols-3 gap-[4%]">
        {[0, 1, 2].map((item) => (
          <div key={item}>
            <i
              className="block aspect-[1.6] rounded-sm"
              style={{
                backgroundColor: `color-mix(in srgb, ${accent} ${22 + item * 8}%, #a9aaa4)`,
              }}
            />
            <i className="mt-[6%] block h-[3px] w-[76%] rounded bg-black/10 dark:bg-white/11" />
            <i className="mt-[4%] block h-[3px] w-[48%] rounded bg-black/6 dark:bg-white/7" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorPreview({ accent }: { accent: string }) {
  return (
    <div className="flex h-[92%]">
      <SideRail accent={accent} />
      <div className="flex-1 p-[7%_9%]">
        <i className="block h-[8px] w-[57%] rounded bg-black/14 dark:bg-white/15" />
        <i className="mt-[5%] block h-[3px] w-[32%] rounded bg-black/7 dark:bg-white/8" />
        <div className="mt-[9%] border-l-[2px] pl-[5%]" style={{ borderColor: accent }}>
          {[98, 92, 76, 88, 58].map((width) => (
            <i
              key={width}
              className="mb-[4%] block h-[3px] rounded bg-black/8 dark:bg-white/9"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
        <div className="mt-[9%] grid grid-cols-2 gap-[5%]">
          {[0, 1].map((item) => (
            <i
              key={item}
              className="block h-[30px] rounded-sm bg-black/[0.035] dark:bg-white/[0.04]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsPreview({ accent }: { accent: string }) {
  return (
    <div className="flex h-[92%]">
      <SideRail accent={accent} />
      <div className="flex-1 p-[6%_9%]">
        <i className="block h-[7px] w-[37%] rounded bg-black/14 dark:bg-white/15" />
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="mt-[7%] flex items-center border-b border-black/5 pb-[6%] dark:border-white/6"
          >
            <span className="flex-1">
              <i className="block h-[3px] w-[35%] rounded bg-black/11 dark:bg-white/12" />
              <i className="mt-[4%] block h-[2px] w-[60%] rounded bg-black/6 dark:bg-white/7" />
            </span>
            <i
              className="h-[9px] w-[18%] rounded-sm border border-black/8 dark:border-white/9"
              style={item === 1 ? { backgroundColor: accent } : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
