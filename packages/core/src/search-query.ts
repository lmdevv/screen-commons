import type { SearchMatch, SearchMode } from "./api";
import { PLATFORMS } from "./taxonomy";

export const MIN_STRICT_RESULTS = 3;

const MAX_TERMS = 8;
const MAX_APP_NAME_WORDS = 4;

const STOPWORDS = new Set(
  `a an the and or of to in on at by for from with into via about as is are was be been being it its this that these those
  how does do did doing can could would should will may might must i me my we our you your they them their he she his her
  user users people someone somebody person customer customers let lets allow allows allowed enable enables
  what where when which who whom why whose there here some any all each
  show find give get see example examples way ways work works working use using
  look looks like handle handles happen happens
  app apps application flow flows screen screens step steps process ui ux feature features`.split(
    /\s+/u,
  ),
);

const SUFFIXES = ["ations", "ation", "ings", "ing", "ies", "ied", "es", "ed", "s", "e"];

const BEFORE_NAME = new Set(["does", "did", "in", "on", "for", "my", "your", "our"]);
const AFTER_NAME = new Set(
  "s app apps application flow flows screen screens ui ux feature features".split(" "),
);
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
const PLACES = new Set(["in", "on"]);

const TLDS = new Set("com io app ai co so dev net org me tv fm gg xyz".split(" "));

const PLATFORM_WORDS = new Set([
  ...PLATFORMS.map((platform) => platform.slug),
  ..."mac macos windows linux desktop mobile tablet iphone ipad".split(" "),
]);

export interface QueryWord {
  /** As typed, without diacritics: `Playlists`. */
  typed: string;
  text: string;
  stem: string | null;
  tld: boolean;
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
  phrases: string[][];
}

export interface NamedApp {
  slug: string;
  name: string;
}

export interface ResolvedQuery<App extends NamedApp> {
  apps: App[];
  holdsWithoutResults: boolean;
  terms: SearchTerm[];
  missingApps: { text: string; words: string[] }[];
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

/** Mirrors the `unicode61 remove_diacritics 2` tokenizer of the `*_fts` tables. */
function tokenize(text: string): { word: string; dotted: boolean }[] {
  const folded = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .normalize("NFC");
  let end = 0;
  return [...folded.matchAll(/[\p{L}\p{N}]+/gu)].map((found) => {
    const dotted = end > 0 && folded.slice(end, found.index) === ".";
    end = found.index + found[0].length;
    return { word: found[0], dotted };
  });
}

const nameKey = (name: string) =>
  tokenize(name)
    .map(({ word }) => word)
    .join(" ")
    .toLowerCase();

const SYNONYMS = [
  ["signup", "sign up", "register"],
  ["login", "signin", "log in", "sign in"],
  ["logout", "signout", "log out", "sign out"],
].map((spellings) =>
  spellings.map((spelling) => tokenize(spelling).map(({ word }) => stemWord(word))),
);

const isStopword = (word: QueryWord) => STOPWORDS.has(word.text);

export function planSearchQuery(query: string): SearchQueryPlan {
  const words = tokenize(query).map(({ word: typed, dotted }) => {
    const text = typed.toLowerCase();
    const tld = dotted && TLDS.has(text);
    return {
      typed,
      text,
      stem: tld || STOPWORDS.has(text) || text.length < 2 ? null : stemWord(text),
      tld,
    };
  });
  return { words };
}

const spanText = (words: QueryWord[], span: Span, separator = " ") =>
  words
    .slice(span.start, span.end)
    .map((word) => word.text)
    .join(separator);

const typedName = (words: QueryWord[], span: Span) =>
  words
    .slice(span.start, span.end)
    .map((word, index) => `${index === 0 ? "" : word.tld ? "." : " "}${word.typed}`)
    .join("");

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
  const capitalized = (word: QueryWord) => word.text.length > 1 && /^\p{Lu}/u.test(word.typed);
  const nameable = (word: QueryWord) => word.stem !== null && !PLATFORM_WORDS.has(word.text);
  const askedAbout = (start: number) => ASKED.has(text[start - 1] ?? "");
  const capitalsMarkNames =
    words.some(capitalized) && words.some((word) => word.stem !== null && !capitalized(word));

  const runs: Span[] = [];
  words.forEach((word, index) => {
    const run = runs.at(-1);
    const joins = run?.end === index && run.end - run.start < MAX_APP_NAME_WORDS;
    if (joins && (word.tld || (capitalized(word) && nameable(word)))) run.end += 1;
    else if (capitalized(word) && nameable(word)) runs.push({ start: index, end: index + 1 });
  });
  const wordsBeforeVerb = (start: number): Span[] => {
    const end = [start + 1, start + 2].find((index) => ASKED_VERBS.has(text[index] ?? ""));
    return end !== undefined &&
      words.slice(start, end).every((word, index) => nameable(word) || (index > 0 && word.tld))
      ? [{ start, end }]
      : [];
  };
  const possessiveOrLastPlace = ({ start, end }: Span) =>
    text[end] === "s" ||
    (PLACES.has(wordBefore(text, start)) && (end === words.length || text[end] === "app"));

  const asked = capitalsMarkNames
    ? runs.filter((run) => askedAbout(run.start))
    : words.flatMap((_, start) => (askedAbout(start) ? wordsBeforeVerb(start) : []));
  const placed = runs.filter(possessiveOrLastPlace);
  return [
    ...asked,
    ...placed.filter((run) => !asked.some((span) => span.start === run.start)),
  ].sort((a, b) => a.start - b.start);
}

function synonymAt(words: QueryWord[], start: number) {
  for (const spellings of SYNONYMS) {
    const length = spellings.find((stems) =>
      stems.every((stem, offset) => {
        const word = words[start + offset];
        return word !== undefined && stemWord(word.text) === stem;
      }),
    )?.length;
    if (length) return { spellings, end: start + length };
  }
  return undefined;
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
    AFTER_NAME.has(text[span.end] ?? "");
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

  const terms: SearchTerm[] = [];
  const add = (term: SearchTerm) => {
    if (!terms.some((each) => each.stem === term.stem)) terms.push(term);
  };
  for (let start = 0; start < words.length; start += 1) {
    if (filterBy && start >= filterBy.start && start < filterBy.end) continue;
    const synonym = synonymAt(words, start);
    if (synonym) {
      add({
        word: spanText(words, { start, end: synonym.end }),
        stem: synonym.spellings[0]!.join(" "),
        phrases: synonym.spellings,
      });
      start = synonym.end - 1;
      continue;
    }
    const { text: word, stem } = words[start]!;
    if (stem) add({ word, stem, phrases: stemPrefixes(stem).map((prefix) => [prefix]) });
  }

  return {
    apps: filterBy?.apps ?? [],
    holdsWithoutResults: filterBy?.holdsWithoutResults ?? false,
    terms: terms.slice(0, MAX_TERMS),
    missingApps: missingApps.map((span) => ({
      text: typedName(words, span),
      words: words.slice(span.start, span.end).flatMap((word) => (word.stem ? [word.text] : [])),
    })),
  };
}

export function searchMatch(
  query: ResolvedQuery<NamedApp>,
  mode: SearchMode,
  matchedStems: ReadonlySet<string>,
  knownWords: ReadonlySet<string>,
  fromNamedApp: boolean,
): SearchMatch {
  const named = query.apps[0]?.slug ?? null;
  const matched = query.terms.filter((term) => matchedStems.has(term.stem));
  return {
    mode,
    app: fromNamedApp ? named : null,
    appWithoutResults: fromNamedApp ? null : named,
    appNotFound:
      query.missingApps.find((name) => !name.words.every((word) => knownWords.has(word)))?.text ??
      null,
    matchedTerms: matched.map((term) => term.word),
    unmatchedTerms: query.terms.filter((term) => !matched.includes(term)).map((term) => term.word),
  };
}
