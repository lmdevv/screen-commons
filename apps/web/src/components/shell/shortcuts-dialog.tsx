/* Keyboard shortcuts reference (`?`). Lazy chunk. */
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Kbd,
  KbdGroup,
  useIsMac,
} from "@screen-commons/ui";

export default function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mod = useIsMac() ? "⌘" : "Ctrl";
  const groups: { title: string; items: { keys: string[]; label: string }[] }[] = [
    {
      title: "Anywhere",
      items: [
        { keys: [mod, "K"], label: "Search" },
        { keys: ["?"], label: "Keyboard shortcuts" },
        { keys: ["Esc"], label: "Close overlay or clear selection" },
      ],
    },
    {
      title: "Grids",
      items: [
        { keys: ["Tab"], label: "Move between tiles" },
        { keys: ["Enter"], label: "Open the focused tile" },
        { keys: ["Shift", "Click"], label: "Select a range of screens" },
        { keys: [mod, "Click"], label: "Add a screen to the selection" },
      ],
    },
    {
      title: "Screen viewer",
      items: [
        { keys: ["←", "→"], label: "Previous / next screen" },
        { keys: ["S"], label: "Save" },
        { keys: [mod, "C"], label: "Copy image" },
        { keys: ["Z"], label: "Toggle fit / actual size" },
      ],
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-6 pb-6">
          {groups.map((group) => (
            <section key={group.title} className="flex flex-col gap-1">
              <h3 className="mb-1 text-sm font-medium text-fg-muted">{group.title}</h3>
              {group.items.map((item) => (
                <div key={item.label} className="flex h-8 items-center justify-between gap-4">
                  <span className="text-base text-fg">{item.label}</span>
                  <KbdGroup>
                    {item.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </KbdGroup>
                </div>
              ))}
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
