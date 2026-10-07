import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@open-ui/ui";

import type { DocsSection } from "./content";
import { DocsNav } from "./docs-nav";

/** Mobile docs navigation. Lazy-loaded: the dialog engine only loads when it's opened. */
export default function DocsNavSheet({
  open,
  onOpenChange,
  sections,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: DocsSection[];
  current: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[320px]">
        <SheetHeader>
          <SheetTitle>Documentation</SheetTitle>
        </SheetHeader>
        <SheetBody className="px-3.5">
          <DocsNav sections={sections} current={current} onNavigate={() => onOpenChange(false)} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
