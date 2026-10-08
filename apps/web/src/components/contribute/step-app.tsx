import type { AppSummary } from "@screen-commons/core";
import {
  CATEGORIES,
  labelFor,
  type CategorySlug,
  type Platform,
} from "@screen-commons/core/taxonomy";
import {
  AppLogo,
  Field,
  FieldError,
  Input,
  Label,
  NativeSelect,
  Optional,
  Skeleton,
  Textarea,
  cn,
  pluralize,
} from "@screen-commons/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, Plus, Search } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { queries } from "../../lib/queries";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { isValidUrl, normalizeUrl, type AppChoice, type NewApp } from "./model";

export function StepApp({
  platform,
  choice,
  onChoiceChange,
  newApp,
  onNewAppChange,
  showErrors,
}: {
  platform: Platform;
  choice: AppChoice | null;
  onChoiceChange: (choice: AppChoice) => void;
  newApp: NewApp;
  onNewAppChange: (patch: Partial<NewApp>) => void;
  showErrors: boolean;
}) {
  const [query, setQuery] = useState(choice?.mode === "existing" ? choice.app.name : "");
  const q = useDebouncedValue(query.trim(), 150);
  const apps = useQuery({
    ...queries.apps({ platform, q: q || undefined, limit: 8 }),
    placeholderData: keepPreviousData,
  });
  const items = apps.data?.items ?? [];
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const optionCount = items.length + 1; // + "Create new app"

  const select = (index: number) => {
    const app = items[index];
    if (app) onChoiceChange({ mode: "existing", app });
    else {
      onChoiceChange({ mode: "new" });
      if (!newApp.name && query.trim()) onNewAppChange({ name: query.trim() });
    }
  };

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return; // Enter commits the IME composition instead
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(optionCount - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(active);
    }
  }

  const nameError = showErrors && choice?.mode === "new" && !newApp.name.trim();
  const urlError =
    choice?.mode === "new" &&
    newApp.websiteUrl.trim() !== "" &&
    !isValidUrl(normalizeUrl(newApp.websiteUrl));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold text-fg">Which app is this?</h2>
        <p className="mt-1 text-base text-fg-muted">
          Pick an existing {labelFor(platform)} app or add a new one.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Input
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={`${listId}-${active}`}
          aria-label="Search apps"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search apps by name"
          leading={<Search />}
          size="lg"
          autoFocus
          autoComplete="off"
        />
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Apps"
          className={cn("flex flex-col gap-1 transition-opacity", apps.isFetching && "opacity-70")}
        >
          {apps.isPending
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-card" />)
            : items.map((app, index) => (
                <AppOption
                  key={app.id}
                  id={`${listId}-${index}`}
                  app={app}
                  active={active === index}
                  selected={choice?.mode === "existing" && choice.app.id === app.id}
                  onSelect={() => select(index)}
                  onHover={() => setActive(index)}
                />
              ))}
          <li
            id={`${listId}-${items.length}`}
            role="option"
            aria-selected={choice?.mode === "new"}
            onClick={() => select(items.length)}
            onMouseEnter={() => setActive(items.length)}
            className={cn(
              "flex h-14 cursor-pointer items-center gap-3 rounded-card px-2.5 text-base transition-colors",
              active === items.length && "bg-muted",
              choice?.mode === "new" && "ring-1 ring-border-strong ring-inset",
            )}
          >
            <span className="flex size-9 items-center justify-center rounded-[9px] border border-dashed border-border-strong text-fg-muted">
              <Plus className="size-4" />
            </span>
            <span className="flex-1 font-medium text-fg">
              {query.trim() && items.length === 0 ? `Create “${query.trim()}”` : "Create a new app"}
            </span>
            {choice?.mode === "new" ? <Check aria-hidden className="size-4 text-fg" /> : null}
          </li>
        </ul>
        {!apps.isPending && items.length === 0 && q ? (
          <p className="text-sm text-fg-muted">
            No {labelFor(platform)} apps match “{q}”.
          </p>
        ) : null}
      </div>

      {choice?.mode === "new" ? (
        <div className="flex flex-col gap-5 rounded-tile border border-border p-5 sm:p-6">
          <h3 className="text-md font-semibold text-fg">New app</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field name="app-name" invalid={nameError}>
              <Label>Name</Label>
              <Input
                value={newApp.name}
                onChange={(event) => onNewAppChange({ name: event.target.value })}
                placeholder="Linear"
                maxLength={80}
                required
              />
              <FieldError match={nameError}>Give the app a name.</FieldError>
            </Field>
            <Field name="app-website" invalid={urlError}>
              <Label>
                Website <Optional />
              </Label>
              <Input
                value={newApp.websiteUrl}
                onChange={(event) => onNewAppChange({ websiteUrl: event.target.value })}
                onBlur={() =>
                  newApp.websiteUrl &&
                  onNewAppChange({ websiteUrl: normalizeUrl(newApp.websiteUrl) })
                }
                placeholder="https://linear.app"
                inputMode="url"
                autoComplete="url"
              />
              <FieldError match={urlError}>Enter a full URL, like https://linear.app</FieldError>
            </Field>
          </div>
          <Field name="app-category">
            <Label>
              Category <Optional />
            </Label>
            <NativeSelect<CategorySlug | "">
              value={newApp.category}
              onValueChange={(category) => onNewAppChange({ category })}
              options={[
                { value: "", label: "Choose a category" },
                ...CATEGORIES.map(({ slug, label }) => ({ value: slug, label })),
              ]}
              aria-label="Category"
            />
          </Field>
          <Field name="app-tagline">
            <Label>
              Tagline <Optional />
            </Label>
            <Textarea
              rows={2}
              maxLength={140}
              value={newApp.tagline}
              onChange={(event) => onNewAppChange({ tagline: event.target.value })}
              placeholder="The issue tracker you’ll enjoy using"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function AppOption({
  id,
  app,
  active,
  selected,
  onSelect,
  onHover,
}: {
  id: string;
  app: AppSummary;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        "flex h-14 cursor-pointer items-center gap-3 rounded-card px-2.5 transition-colors",
        active && "bg-muted",
        selected && "ring-1 ring-border-strong ring-inset",
      )}
    >
      <AppLogo app={app} size="md" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-medium text-fg">{app.name}</span>
        <span className="truncate text-sm text-fg-muted">
          {app.tagline ?? pluralize(app.screenCount, "screen")}
        </span>
      </span>
      {selected ? <Check aria-hidden className="size-4 shrink-0 text-fg" /> : null}
    </li>
  );
}
