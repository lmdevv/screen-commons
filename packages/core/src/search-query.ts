import type { SearchMatch, SearchMode } from "./api";

export const MIN_STRICT_RESULTS = 3;

const MAX_TERMS = 8;
const MAX_LOOKUP_WORDS = 32;
const MAX_APP_NAME_WORDS = 4;

const STOPWORDS = new Set(
  `a an the and or of to in on at by for from with into via about as is are was be been being it its this that these those
  how does do did doing can could would should will may might must i me my we our you your they them their he she his her
  user users people someone somebody person customer customers let lets allow allows allowed enable enables
  what where when which who whom why whose there here some any all each
  show find give get see example examples way ways work works working use using
  app apps application flow flows screen screens step steps process ui ux feature features`.split(
    /\s+/u,
  ),
);

const SUFFIXES = ["ations", "ation", "ings", "ing", "ies", "ied", "es", "ed", "s", "e"];

const BEFORE_APP = new Set(["does", "do", "did"]);
const AFTER_APP = new Set([
  "let",
  "lets",
  "allow",
  "allows",
  "handle",
  "handles",
  "implement",
  "implements",
  "do",
  "show",
  "shows",
  "support",
  "supports",
]);
const BEFORE_LAST_APP = new Set(["in", "on", "inside", "within"]);

export interface QueryWord {
  /** As typed, without diacritics: `Playlists`. */
  typed: string;
  text: string;
  /** The prefix searched for, or null for a stopword: `playlist`. */
  stem: string | null;
}

export interface WordSpan {
  start: number;
  end: number;
}

export interface SearchQueryPlan {
  words: QueryWord[];
  /** Spans that read as an app name, from capitalization and phrasing such as "does X let". */
  appCandidates: WordSpan[];
}

export interface SearchTerm {
  word: string;
  stem: string;
}

export interface NamedApp {
  slug: string;
  name: string;
  host: string | null;
}

export interface ResolvedQuery<App extends NamedApp> {
  apps: App[];
  terms: SearchTerm[];
  /** Spans that may name an app the catalog lacks, with the stems of their terms. */
  appCandidates: { text: string; stems: string[] }[];
}

/** Strip the first suffix that leaves 3 or more characters, so the stem matches every form. */
export function stemWord(word: string): string {
  for (const suffix of SUFFIXES) {
    if (!word.endsWith(suffix) || word.length - suffix.length < 3) continue;
    let stem = word.slice(0, -suffix.length);
    if (suffix === "ies") stem += "y";
    const last = stem.at(-1)!;
    if (stem.length >= 4 && last === stem.at(-2) && !"aeiouls".includes(last)) {
      stem = stem.slice(0, -1);
    }
    if (stem.length >= 4 && stem.endsWith("ll")) stem = stem.slice(0, -1);
    return stem;
  }
  return word;
}

/** Mirrors the `unicode61 remove_diacritics 2` tokenizer of the `*_fts` tables. */
function splitWords(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const nameKey = (name: string) => splitWords(name).join(" ").toLowerCase();

/**
 * `spotify.com` and `www.bbc.co.uk` → `spotify` and `bbc`. A host under another subdomain, such
 * as `podcasts.apple.com`, has none, since its label names the company rather than the app.
 */
function hostLabel(host: string | null): string | null {
  const labels =
    host
      ?.toLowerCase()
      .replace(/^www\./u, "")
      .split(".") ?? [];
  const secondLevel = labels.length === 3 && ["co", "com", "net", "org"].includes(labels[1]!);
  const label = labels.length === 2 || secondLevel ? labels[0]! : null;
  return label === "example" ? null : label;
}

function findAppCandidates(words: QueryWord[]): WordSpan[] {
  const spans: WordSpan[] = [];
  const add = (start: number, end: number) => {
    if (!spans.some((span) => span.start === start && span.end === end)) spans.push({ start, end });
  };
  const capitalized = (index: number) => /^\p{Lu}/u.test(words[index]?.typed ?? "");
  for (let start = 1; start < words.length; start += 1) {
    if (!capitalized(start) || words[start]!.typed === "I") continue;
    let end = start + 1;
    while (capitalized(end)) end += 1;
    add(start, end);
    start = end - 1;
  }
  const text = words.map((word) => word.text);
  for (let index = 0; index < text.length; index += 1) {
    if (BEFORE_APP.has(text[index]!) && !STOPWORDS.has(text[index + 1] ?? "a")) {
      const length = [1, 2].find((n) => AFTER_APP.has(text[index + n + 1] ?? ""));
      if (length) add(index + 1, index + 1 + length);
    }
    if (BEFORE_LAST_APP.has(text[index]!)) {
      const at = index + (text[index + 1] === "the" ? 2 : 1);
      if (at === text.length - 1 || (at < text.length && text[at + 1] === "app")) add(at, at + 1);
    }
  }
  return spans;
}

export function planSearchQuery(query: string): SearchQueryPlan {
  const words = splitWords(query).map((typed) => {
    const text = typed.toLowerCase();
    return { typed, text, stem: STOPWORDS.has(text) ? null : stemWord(text) };
  });
  return { words, appCandidates: findAppCandidates(words) };
}

const candidateWords = (plan: SearchQueryPlan) =>
  plan.appCandidates.flatMap((span) => plan.words.slice(span.start, span.end));

export function appLookupWords(plan: SearchQueryPlan): string[] {
  return [...new Set([...candidateWords(plan), ...plan.words].map((word) => word.text))].slice(
    0,
    MAX_LOOKUP_WORDS,
  );
}

function* spansWithin({ start, end }: WordSpan): Generator<WordSpan> {
  for (let length = Math.min(MAX_APP_NAME_WORDS, end - start); length >= 1; length -= 1) {
    for (let first = start; first + length <= end; first += 1) {
      yield { start: first, end: first + length };
    }
  }
}

/**
 * Runs inside a candidate span resolve first, so "resend" in "How do I resend an invite on
 * Spotify?" doesn't outrank "Spotify". Candidate words are the last terms dropped, so a long
 * question can still report a missing app.
 */
export function resolveQuery<App extends NamedApp>(
  plan: SearchQueryPlan,
  apps: readonly App[],
): ResolvedQuery<App> {
  const byName = new Map<string, App[]>();
  const byLabel = new Map<string, App[]>();
  const add = (map: Map<string, App[]>, key: string | null, app: App) => {
    if (key) map.set(key, [...(map.get(key) ?? []), app]);
  };
  for (const app of apps) {
    add(byName, nameKey(app.name), app);
    add(byLabel, hostLabel(app.host), app);
  }
  let named: { apps: App[]; span: WordSpan } | null = null;
  for (const within of [...plan.appCandidates, { start: 0, end: plan.words.length }]) {
    for (const span of spansWithin(within)) {
      const key = plan.words
        .slice(span.start, span.end)
        .map((word) => word.text)
        .join(" ");
      const found = byName.get(key) ?? byLabel.get(key);
      if (found) {
        named = { apps: found, span };
        break;
      }
    }
    if (named) break;
  }
  const inNamed = (index: number) => named && index >= named.span.start && index < named.span.end;
  const candidateStems = new Set(named ? [] : candidateWords(plan).map((word) => word.stem));
  const terms: SearchTerm[] = [];
  plan.words.forEach(({ text, stem }, index) => {
    if (!stem || text.length < 2 || inNamed(index) || terms.some((term) => term.stem === stem)) {
      return;
    }
    terms.push({ word: text, stem });
  });
  const kept = new Set(
    [
      ...terms.filter((term) => candidateStems.has(term.stem)),
      ...terms.filter((term) => !candidateStems.has(term.stem)),
    ].slice(0, MAX_TERMS),
  );
  const searched = terms.filter((term) => kept.has(term));
  const stems = new Set(searched.map((term) => term.stem));
  return {
    apps: named?.apps ?? [],
    terms: searched,
    appCandidates: named
      ? []
      : plan.appCandidates.flatMap((span) => {
          const words = plan.words.slice(span.start, span.end);
          const spanStems = words.flatMap(({ stem }) => (stem && stems.has(stem) ? [stem] : []));
          return spanStems.length > 0
            ? [{ text: words.map((word) => word.typed).join(" "), stems: spanStems }]
            : [];
        }),
  };
}

/** A candidate is a missing app when no result contains one of its words, so it isn't a feature word. */
export function searchMatch(
  query: ResolvedQuery<NamedApp>,
  mode: SearchMode,
  matchedStems: ReadonlySet<string>,
): SearchMatch {
  const matched = query.terms.filter((term) => matchedStems.has(term.stem));
  return {
    mode,
    app: query.apps[0]?.slug ?? null,
    appNotFound:
      query.appCandidates.find((candidate) =>
        candidate.stems.some((stem) => !matchedStems.has(stem)),
      )?.text ?? null,
    matchedTerms: matched.map((term) => term.word),
    unmatchedTerms: query.terms.filter((term) => !matched.includes(term)).map((term) => term.word),
  };
}
