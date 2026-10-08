/** First tab stop of every page with a header: jumps past the chrome to `<main id="main">`. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="ou-focus-ring sr-only z-50 rounded-pill bg-inverse px-4 py-2 text-base font-medium text-inverse-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Skip to content
    </a>
  );
}
