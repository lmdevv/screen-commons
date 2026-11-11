import type { SearchMatch, SearchMode } from "./api";

export const MIN_STRICT_RESULTS = 3;

const MAX_TERMS = 8;
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

const BEFORE_NAME = new Set(["does", "did", "in", "on", "for"]);
const ASKED = new Set(["does", "did"]);
const ASKED_VERBS = new Set([
  "let",
  "lets",
  "allow",
  "allows",
  "handle",
  "handles",
  "have",
  "has",
  "support",
  "supports",
  "implement",
  "implements",
  "show",
  "shows",
  "do",
]);
const PLACES = new Set(["in", "on", "for"]);

export interface QueryWord {
  /** As typed, without diacritics: `Playlists`. */
  typed: string;
  text: string;
  stem: string | null;
}

export interface SearchQueryPlan {
  words: QueryWord[];
}

interface Span {
  start: number;
  end: number;
}

export interface SearchTerm {
  word: string;
  stem: string;
  wholeWord: boolean;
}

export interface NamedApp {
  slug: string;
  name: string;
}

export interface ResolvedQuery<App extends NamedApp> {
  apps: App[];
  holdsWithoutResults: boolean;
  terms: SearchTerm[];
  missingApps: { text: string; stems: string[] }[];
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

export function stemPrefixes(stem: string): string[] {
  return stem.length >= 4 && /[^aeiou]y$/u.test(stem) ? [stem, `${stem.slice(0, -1)}ie`] : [stem];
}

const NEVER_APP_NAMES = new Set(
  `hover click tap press submit scroll swipe drag focus load save error success push map
  mobile desktop web tablet ios android iphone ipad settings`
    .split(/\s+/u)
    .map(stemWord),
);

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

const isStopword = (word: QueryWord) => STOPWORDS.has(word.text);

export function planSearchQuery(query: string): SearchQueryPlan {
  const words = splitWords(query).map((typed) => {
    const text = typed.toLowerCase();
    return {
      typed,
      text,
      stem: STOPWORDS.has(text) || text.length < 2 ? null : stemWord(text),
    };
  });
  return { words };
}

const spanText = (
  words: QueryWord[],
  span: Span,
  separator = " ",
  field: "text" | "typed" = "text",
) =>
  words
    .slice(span.start, span.end)
    .map((word) => word[field])
    .join(separator);

function nameSpans(words: QueryWord[]): Span[] {
  return words.flatMap((_, start) =>
    Array.from({ length: Math.min(MAX_APP_NAME_WORDS, words.length - start) }, (_, index) => ({
      start,
      end: start + index + 1,
    })).filter((span) => words.slice(span.start, span.end).some((word) => !isStopword(word))),
  );
}

export function appNameKeys({ words }: SearchQueryPlan): { names: string[]; slugs: string[] } {
  const spans = nameSpans(words);
  return {
    names: [...new Set(spans.map((span) => spanText(words, span)))],
    slugs: [...new Set(spans.map((span) => spanText(words, span, "-")))],
  };
}

const wordBefore = (text: string[], index: number) =>
  (text[index - 1] === "the" ? text[index - 2] : text[index - 1]) ?? "";

function askedNames(words: QueryWord[]): Span[] {
  const text = words.map((word) => word.text);
  const mixedCase = words.some((word) => word.stem !== null && /^\p{Ll}/u.test(word.typed));
  const capitalized = (index: number) => mixedCase && /^\p{Lu}/u.test(words[index]?.typed ?? "");
  const askedEnd = (start: number) => {
    if (ASKED_VERBS.has(text[start + 1] ?? "")) return start + 1;
    if (capitalized(start)) return capitalized(start + 1) ? start + 2 : start + 1;
    return ASKED_VERBS.has(text[start + 2] ?? "") ? start + 2 : undefined;
  };
  const placedEnd = (start: number) =>
    PLACES.has(wordBefore(text, start)) && (start + 1 === words.length || text[start + 1] === "app")
      ? start + 1
      : undefined;
  const possessiveEnd = (start: number) => (text[start + 1] === "s" ? start + 1 : undefined);
  const canName = (word: QueryWord) => word.stem !== null && !NEVER_APP_NAMES.has(word.stem);
  return words.flatMap((_, start): Span[] => {
    const end = ASKED.has(text[start - 1] ?? "")
      ? askedEnd(start)
      : (placedEnd(start) ?? possessiveEnd(start));
    return end !== undefined && words.slice(start, end).every(canName) ? [{ start, end }] : [];
  });
}

export function resolveQuery<App extends NamedApp>(
  plan: SearchQueryPlan,
  apps: readonly App[],
  appGiven = false,
): ResolvedQuery<App> {
  const { words } = plan;
  const text = words.map((word) => word.text);
  const byKey = new Map<string, Set<App>>();
  for (const app of apps) {
    for (const key of [nameKey(app.name), app.slug]) {
      byKey.set(key, (byKey.get(key) ?? new Set()).add(app));
    }
  }
  const holdsAt = (span: Span) =>
    appGiven ||
    span.start === 0 ||
    span.end === words.length ||
    BEFORE_NAME.has(wordBefore(text, span.start)) ||
    ["s", "app"].includes(text[span.end] ?? "");
  const [mention] = nameSpans(words)
    .flatMap((span) => {
      const found = new Set([
        ...(byKey.get(spanText(words, span)) ?? []),
        ...(byKey.get(spanText(words, span, "-")) ?? []),
      ]);
      return found.size > 0
        ? [{ ...span, apps: [...found], holdsWithoutResults: holdsAt(span) }]
        : [];
    })
    .sort(
      (a, b) =>
        Number(b.holdsWithoutResults) - Number(a.holdsWithoutResults) ||
        b.end - b.start - (a.end - a.start) ||
        a.start - b.start,
    );
  const missingApps = appGiven || mention?.holdsWithoutResults ? [] : askedNames(words);
  const filterBy = missingApps.length > 0 ? undefined : mention;

  const missingStems = new Set(
    missingApps.flatMap((span) => words.slice(span.start, span.end).map((word) => word.stem)),
  );
  const terms: SearchTerm[] = [];
  words.forEach(({ text: word, stem }, index) => {
    const inName = filterBy !== undefined && index >= filterBy.start && index < filterBy.end;
    if (!stem || inName || terms.some((term) => term.stem === stem)) return;
    terms.push({ word, stem, wholeWord: missingStems.has(stem) });
  });
  const kept = new Set(
    [...terms.filter((term) => term.wholeWord), ...terms.filter((term) => !term.wholeWord)].slice(
      0,
      MAX_TERMS,
    ),
  );
  const searched = terms.filter((term) => kept.has(term));
  const searchedStems = new Set(searched.map((term) => term.stem));

  return {
    apps: filterBy?.apps ?? [],
    holdsWithoutResults: filterBy?.holdsWithoutResults ?? false,
    terms: searched,
    missingApps: missingApps.flatMap((span) => {
      const stems = words
        .slice(span.start, span.end)
        .flatMap(({ stem }) => (stem && searchedStems.has(stem) ? [stem] : []));
      return stems.length > 0 ? [{ text: spanText(words, span, " ", "typed"), stems }] : [];
    }),
  };
}

export function searchMatch(
  query: ResolvedQuery<NamedApp>,
  mode: SearchMode,
  matchedStems: ReadonlySet<string>,
  fromNamedApp: boolean,
): SearchMatch {
  const named = query.apps[0]?.slug ?? null;
  const matched = query.terms.filter((term) => matchedStems.has(term.stem));
  const foundInResults = (name: { stems: string[] }) =>
    name.stems.every((stem) => matchedStems.has(stem));
  return {
    mode,
    app: fromNamedApp ? named : null,
    appWithoutResults: fromNamedApp ? null : named,
    appNotFound: query.missingApps.find((name) => !foundInResults(name))?.text ?? null,
    matchedTerms: matched.map((term) => term.word),
    unmatchedTerms: query.terms.filter((term) => !matched.includes(term)).map((term) => term.word),
  };
}
