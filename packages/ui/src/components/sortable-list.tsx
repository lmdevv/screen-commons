import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/cn";

export { arrayMove };

/** Move one item in an array (immutable). `moveItem(list, 0, 2)`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  return arrayMove([...items], from, to);
}

/** Props to spread on the drag handle element (keyboard + pointer activation). */
export interface SortableHandleProps {
  ref: (element: HTMLElement | null) => void;
  [key: string]: unknown;
}

export interface SortableRenderState {
  index: number;
  isDragging: boolean;
  /** Spread on a handle: `<SortableHandle {...handle} />`. */
  handle: SortableHandleProps;
}

export interface SortableListProps<T> {
  items: readonly T[];
  getId: (item: T) => UniqueIdentifier;
  /** Receives the reordered array. */
  onReorder: (items: T[]) => void;
  renderItem: (item: T, state: SortableRenderState) => React.ReactNode;
  /** Layout + sorting strategy. */
  orientation?: "vertical" | "horizontal" | "grid";
  className?: string;
  /** Accessible name for the list. */
  "aria-label"?: string;
  /** Spoken names for screen reader announcements. Default: "item 1", "item 2"… */
  getLabel?: (item: T, index: number) => string;
}

/**
 * Reorderable list (flow steps, upload order) on dnd-kit: pointer drag with a small activation
 * distance (so clicks still work), keyboard (focus handle → Space → arrows → Space), screen
 * reader announcements.
 *
 * <SortableList items={steps} getId={(s) => s.id} onReorder={setSteps}
 *   renderItem={(step, { index, handle }) => (
 *     <FlowStepItem index={index} handle={handle} … />
 *   )} />
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  orientation = "vertical",
  className,
  getLabel,
  ...props
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = React.useMemo(() => items.map(getId), [items, getId]);
  const strategy =
    orientation === "vertical"
      ? verticalListSortingStrategy
      : orientation === "horizontal"
        ? horizontalListSortingStrategy
        : rectSortingStrategy;

  const labelOf = (id: UniqueIdentifier) => {
    const index = ids.indexOf(id);
    const item = items[index];
    return item !== undefined && getLabel ? getLabel(item, index) : `item ${index + 1}`;
  };

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from < 0 || to < 0) return;
    onReorder(moveItem(items, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}.`,
          onDragOver: ({ active, over }) =>
            over ? `${labelOf(active.id)} moved to position ${ids.indexOf(over.id) + 1}.` : "",
          onDragEnd: ({ active, over }) =>
            over
              ? `${labelOf(active.id)} dropped at position ${ids.indexOf(over.id) + 1}.`
              : `${labelOf(active.id)} dropped.`,
          onDragCancel: ({ active }) => `Reordering cancelled. ${labelOf(active.id)} returned.`,
        },
      }}
    >
      <SortableContext items={ids} strategy={strategy}>
        <ol
          aria-label={props["aria-label"]}
          className={cn(
            orientation === "vertical" && "flex flex-col gap-2",
            orientation === "horizontal" && "flex gap-3 overflow-x-auto",
            orientation === "grid" && "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
            className,
          )}
        >
          {items.map((item, index) => (
            <SortableItem key={ids[index]} id={ids[index]!} index={index}>
              {(state) => renderItem(item, state)}
            </SortableItem>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  index,
  children,
}: {
  id: UniqueIdentifier;
  index: number;
  children: (state: SortableRenderState) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative list-none", isDragging && "z-10")}
    >
      {children({
        index,
        isDragging,
        handle: { ref: setActivatorNodeRef, ...attributes, ...listeners },
      })}
    </li>
  );
}

export interface SortableHandleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  handle: SortableHandleProps;
  label?: string;
}

/** Grip button that activates dragging. Keyboard: Space to lift, arrows to move, Space to drop. */
export function SortableHandle({
  handle,
  label = "Reorder",
  className,
  ...props
}: SortableHandleButtonProps) {
  const { ref, ...handleProps } = handle;
  return (
    <button
      type="button"
      ref={ref}
      aria-label={label}
      {...handleProps}
      className={cn(
        "ou-focus-ring flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-[8px] text-fg-subtle transition-colors hover:bg-muted hover:text-fg active:cursor-grabbing",
        className,
      )}
      {...props}
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  );
}
