/* Keyboard shortcuts reference (`?`), rendered from the shortcut registry. Lazy chunk. */
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Shortcut,
} from "@screen-commons/ui";

import { helpSections, type Audience } from "../../lib/shortcuts";

export default function ShortcutsDialog({
  audience,
  finalFocus,
  open,
  onOpenChange,
}: {
  audience: Audience;
  finalFocus: () => boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Letter shortcuts pause while you type in a field or a dialog is open.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-6 pb-6">
          {helpSections(audience).map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="mb-1 text-sm font-medium text-fg-muted">{section.title}</h3>
              <ul className="flex flex-col">
                {section.items.map((item) => (
                  <li key={item.label} className="flex min-h-8 items-center justify-between gap-4">
                    <span className="text-base text-fg">{item.label}</span>
                    <Shortcut keys={item.keys} also={item.also} className="shrink-0" />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
