import {
  ELEMENTS,
  FLOW_TYPES,
  PATTERNS,
  labelFor,
  type ElementSlug,
  type FlowTypeSlug,
  type PatternSlug,
} from "@open-ui/core/taxonomy";
import {
  Field,
  FieldError,
  FilterChip,
  Input,
  Label,
  NativeSelect,
  Optional,
  SortableHandle,
  SortableList,
  Switch,
  cn,
  type SortableHandleProps,
} from "@open-ui/ui";
import { ChevronDown, X } from "lucide-react";
import { useState } from "react";

import { COMMON_PATTERNS, patternLabel, type Draft, type FlowOptions } from "./model";

const MAX_PATTERNS = 8;
const MAX_ELEMENTS = 24;

export function StepScreens({
  drafts,
  onReorder,
  onChange,
  onRemove,
  flow,
  onFlowChange,
  showErrors,
}: {
  drafts: Draft[];
  onReorder: (drafts: Draft[]) => void;
  onChange: (id: string, patch: Partial<Draft>) => void;
  onRemove: (id: string) => void;
  flow: FlowOptions;
  onFlowChange: (patch: Partial<FlowOptions>) => void;
  showErrors: boolean;
}) {
  const canFlow = drafts.length >= 2;
  const nameError = showErrors && flow.enabled && !flow.name.trim();
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold text-fg">Describe the screens</h2>
        <p className="mt-1 text-base text-fg-muted">
          Titles and patterns make screens findable. Drag to change the order.
        </p>
      </div>

      <div className="rounded-tile border border-border p-5 sm:p-6">
        <Switch
          label="Save as a flow"
          description={
            canFlow
              ? "Keep these screens together, in order, as one user journey."
              : "Add at least two screens to save them as a flow."
          }
          checked={flow.enabled && canFlow}
          disabled={!canFlow}
          onCheckedChange={(enabled) => onFlowChange({ enabled })}
        />
        {flow.enabled && canFlow ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field name="flow-name" invalid={nameError}>
              <Label>Flow name</Label>
              <Input
                value={flow.name}
                onChange={(event) => onFlowChange({ name: event.target.value })}
                placeholder="e.g. Signing up with email"
                maxLength={120}
              />
              <FieldError match={nameError}>Name the flow.</FieldError>
            </Field>
            <Field name="flow-type">
              <Label>
                Type <Optional />
              </Label>
              <NativeSelect<FlowTypeSlug | "">
                aria-label="Flow type"
                value={flow.type}
                onValueChange={(type) => onFlowChange({ type })}
                options={[
                  { value: "", label: "Choose a type" },
                  ...FLOW_TYPES.map(({ slug, label }) => ({ value: slug, label })),
                ]}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <SortableList
        items={drafts}
        getId={(draft) => draft.id}
        onReorder={onReorder}
        aria-label="Screens"
        className="gap-3"
        getLabel={(draft, index) => draft.title || `screen ${index + 1}`}
        renderItem={(draft, { index, handle, isDragging }) => (
          <ScreenCard
            draft={draft}
            index={index}
            handle={handle}
            isDragging={isDragging}
            asFlow={flow.enabled && canFlow}
            onChange={(patch) => onChange(draft.id, patch)}
            onRemove={drafts.length > 1 ? () => onRemove(draft.id) : undefined}
          />
        )}
      />
    </div>
  );
}

function toggle<T>(list: readonly T[], value: T, max: number): T[] {
  if (list.includes(value)) return list.filter((item) => item !== value);
  return list.length >= max ? [...list] : [...list, value];
}

function ScreenCard({
  draft,
  index,
  handle,
  isDragging,
  asFlow,
  onChange,
  onRemove,
}: {
  draft: Draft;
  index: number;
  handle: SortableHandleProps;
  isDragging: boolean;
  asFlow: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove?: () => void;
}) {
  const [allPatterns, setAllPatterns] = useState(false);
  const [showElements, setShowElements] = useState(draft.elements.length > 0);
  const visiblePatterns = allPatterns
    ? PATTERNS.map((p) => p.slug)
    : [...new Set<PatternSlug>([...draft.patterns, ...COMMON_PATTERNS])];
  const label = draft.title || `Screen ${index + 1}`;

  return (
    <div
      className={cn(
        "flex gap-4 rounded-tile border border-border bg-surface p-3 pr-4 transition-shadow duration-150 sm:gap-5 sm:p-4",
        isDragging && "shadow-overlay",
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-2">
        <SortableHandle handle={handle} label={`Reorder ${label}`} />
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-fg-muted tabular-nums">
          {index + 1}
        </span>
      </div>
      <div className="w-28 shrink-0 sm:w-44">
        <div className="overflow-hidden rounded-shot bg-tile shadow-[inset_0_0_0_1px_var(--color-shot-border)]">
          <img
            src={draft.previewUrl}
            alt=""
            width={draft.processed?.thumbnailWidth}
            height={draft.processed?.thumbnailHeight}
            className="block h-auto w-full"
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-start gap-2">
          <Input
            value={draft.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="Title, e.g. Pricing"
            aria-label={`Title for screen ${index + 1}`}
            maxLength={160}
            className="flex-1"
          />
          {onRemove ? (
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={onRemove}
              className="ou-focus-ring flex size-10 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-muted hover:text-fg"
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>
        {asFlow ? (
          <Input
            value={draft.stepLabel}
            onChange={(event) => onChange({ stepLabel: event.target.value })}
            placeholder="Step label, e.g. “Enter email”"
            aria-label={`Step label for screen ${index + 1}`}
            maxLength={80}
            size="sm"
          />
        ) : null}
        <fieldset>
          <legend className="text-sm font-medium text-fg">Patterns</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {visiblePatterns.map((slug) => (
              <FilterChip
                key={slug}
                size="sm"
                selected={draft.patterns.includes(slug)}
                onSelectedChange={() =>
                  onChange({ patterns: toggle(draft.patterns, slug, MAX_PATTERNS) })
                }
              >
                {patternLabel(slug)}
              </FilterChip>
            ))}
            <button
              type="button"
              onClick={() => setAllPatterns((all) => !all)}
              className="ou-focus-ring h-7 rounded-pill px-2.5 text-sm font-medium text-fg-muted hover:text-fg"
            >
              {allPatterns ? "Fewer" : `All ${PATTERNS.length}`}
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend className="sr-only">UI elements</legend>
          <button
            type="button"
            aria-expanded={showElements}
            onClick={() => setShowElements((shown) => !shown)}
            className="ou-focus-ring -ml-1 flex items-center gap-1 rounded-xs px-1 text-sm font-medium text-fg"
          >
            UI elements
            {draft.elements.length > 0 ? (
              <span className="text-fg-muted tabular-nums">· {draft.elements.length}</span>
            ) : (
              <span className="font-normal text-fg-subtle">(optional)</span>
            )}
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 text-fg-muted transition-transform",
                showElements && "rotate-180",
              )}
            />
          </button>
          {showElements ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ELEMENTS.map(({ slug }) => (
                <FilterChip
                  key={slug}
                  size="sm"
                  selected={draft.elements.includes(slug as ElementSlug)}
                  onSelectedChange={() =>
                    onChange({
                      elements: toggle(draft.elements, slug as ElementSlug, MAX_ELEMENTS),
                    })
                  }
                >
                  {labelFor(slug)}
                </FilterChip>
              ))}
            </div>
          ) : null}
        </fieldset>
      </div>
    </div>
  );
}
