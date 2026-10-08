/**
 * @screen-commons/ui — design tokens + React components for Screen Commons.
 *
 * Styles: import "@screen-commons/ui/styles.css" once from the app stylesheet.
 * Deep imports are available too: "@screen-commons/ui/components/screen-tile", "@screen-commons/ui/lib/cn".
 * See packages/ui/DESIGN.md for the design language and page recipes.
 */

// lib
export { cn } from "./lib/cn";
export * from "./lib/format";
export {
  useControllableState,
  useHotkey,
  useIsMac,
  usePendingShortcut,
  useReturnFocus,
  useScrolled,
  useScrollEdges,
  useSingleKeyShortcuts,
  type HotkeyOptions,
} from "./lib/hooks";
export {
  ariaKeyShortcuts,
  formatShortcut,
  isCharacterShortcut,
  isEditableTarget,
  isImeKeyEvent,
  shouldIgnoreKeyEvent,
  spokenShortcut,
  topmostLayer,
  SEQUENCE_TIMEOUT_MS,
  SINGLE_KEY_SHORTCUTS_STORAGE_KEY,
  type HotkeyScope,
} from "./lib/keyboard";
export * from "./lib/screen";
export * from "./lib/theme";

// primitives
export * from "./components/avatar";
export * from "./components/badge";
export * from "./components/button";
export * from "./components/card";
export * from "./components/checkbox";
export * from "./components/chip";
export * from "./components/code-block";
export * from "./components/command-palette";
export * from "./components/dialog";
export * from "./components/dropdown-menu";
export * from "./components/empty-state";
export * from "./components/field";
export * from "./components/input";
export * from "./components/kbd";
export * from "./components/layout";
export * from "./components/lightbox";
export * from "./components/link";
export * from "./components/logo";
export * from "./components/popover";
export * from "./components/progress";
export * from "./components/scroll-area";
export * from "./components/search-pill";
export * from "./components/segmented-control";
export * from "./components/select";
export * from "./components/separator";
export * from "./components/skeleton";
export * from "./components/spinner";
export * from "./components/steps";
export * from "./components/table";
export * from "./components/tabs";
export {
  ThemeProvider,
  ThemeToggle,
  THEME_OPTIONS,
  useOptionalTheme,
  useTheme,
  type ThemeProviderProps,
  type ThemeToggleProps,
} from "./components/theme";
export * from "./components/toast";
export * from "./components/tooltip";
export * from "./components/visually-hidden";

// domain
export * from "./components/app-card";
export * from "./components/app-header";
export * from "./components/app-logo";
export * from "./components/category-chips";
export * from "./components/collection-card";
export * from "./components/flow-card";
export * from "./components/flow-step-item";
export * from "./components/flow-strip";
export * from "./components/flow-viewer";
export * from "./components/footer";
export * from "./components/key-value";
export * from "./components/screen-grid";
export * from "./components/screen-image";
export * from "./components/screen-tile";
export * from "./components/screen-viewer";
export * from "./components/section-header";
export * from "./components/selection-bar";
export * from "./components/sortable-list";
export * from "./components/top-bar";
export * from "./components/upload-dropzone";
