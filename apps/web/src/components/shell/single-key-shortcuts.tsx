import { Switch, useIsMac, useSingleKeyShortcuts } from "@screen-commons/ui";

/**
 * "Use single-key shortcuts" (WCAG 2.1.4), saved per device. Off, letters, `/`, `?` and the "G then"
 * sequences stop reacting — speech input and screen reader browse mode type those — while ⌘K and
 * Escape keep working. In Settings and in the `?` dialog.
 */
export function SingleKeyShortcutsSwitch({ className }: { className?: string }) {
  const [enabled, setEnabled] = useSingleKeyShortcuts();
  const palette = useIsMac() ? "⌘K" : "Ctrl+K";
  return (
    <Switch
      className={className}
      label="Use single-key shortcuts"
      description={`Letters and symbols on their own, such as G then S, / and ?. Turn them off if you use speech input or a screen reader. ${palette} and Esc always work.`}
      checked={enabled}
      onCheckedChange={setEnabled}
    />
  );
}
