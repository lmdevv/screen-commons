import type { SearchMatch, SearchMode } from "./api";

export const MIN_STRICT_RESULTS = 3;

const MAX_TERMS = 8;
const MAX_LOOKUP_TERMS = 32;
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
const PREPOSITION_CUES = new Map<string, AppCue>([
  ["in", "located"],
  ["on", "located"],
  ["inside", "located"],
  ["within", "located"],
  ["of", "trailing"],
  ["for", "trailing"],
  ["from", "trailing"],
  ["using", "trailing"],
  ["via", "trailing"],
]);

export const APP_CUES = {
  asked: { tier: 0, reportsMissing: true, wholeSpanOnly: false, holdsWithoutResults: true },
  capitalized: { tier: 1, reportsMissing: true, wholeSpanOnly: false, holdsWithoutResults: true },
  located: { tier: 1, reportsMissing: true, wholeSpanOnly: false, holdsWithoutResults: true },
  trailing: { tier: 1, reportsMissing: false, wholeSpanOnly: false, holdsWithoutResults: true },
  possessive: { tier: 1, reportsMissing: false, wholeSpanOnly: false, holdsWithoutResults: true },
  phrase: { tier: 1, reportsMissing: false, wholeSpanOnly: true, holdsWithoutResults: true },
  edge: { tier: 2, reportsMissing: false, wholeSpanOnly: false, holdsWithoutResults: false },
} as const satisfies Record<
  string,
  { tier: number; reportsMissing: boolean; wholeSpanOnly: boolean; holdsWithoutResults: boolean }
>;

export type AppCue = keyof typeof APP_CUES;

export interface QueryWord {
  /** As typed, without diacritics: `Playlists`. */
  typed: string;
  text: string;
  stem: string | null;
}

export interface WordSpan {
  start: number;
  end: number;
}

export interface AppCandidate extends WordSpan {
  cue: AppCue;
}

export interface SearchQueryPlan {
  words: QueryWord[];
  appCandidates: AppCandidate[];
}

export interface SearchTerm {
  word: string;
  stem: string;
  prefixes: string[];
  words: string[];
  matchesAppColumns: boolean;
}

export interface NamedApp {
  slug: string;
  name: string;
  host: string | null;
}

export type CandidateOutcome = "filter" | "outranked" | "missing" | "word";

export interface ResolvedCandidate extends AppCandidate {
  text: string;
  outcome: CandidateOutcome;
}

export interface ResolvedQuery<App extends NamedApp> {
  candidates: ResolvedCandidate[];
  apps: App[];
  terms: SearchTerm[];
  anyAppTerms: SearchTerm[] | null;
  missing: { text: string; stems: string[] }[];
}

export type SearchScope = "app" | "anyApp";

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

function findAppCandidates(words: QueryWord[]): AppCandidate[] {
  const found: AppCandidate[] = [];
  const add = (cue: AppCue, start: number, end: number) => found.push({ cue, start, end });
  const text = words.map((word) => word.text);
  const searchable = (index: number) => Boolean(words[index]?.stem);
  const capitalized = (index: number) => searchable(index) && /^\p{Lu}/u.test(words[index]!.typed);
  const hasLowercase = words.some((word) => /^\p{Ll}/u.test(word.typed));

  for (let start = 1; hasLowercase && start < words.length; start += 1) {
    if (!capitalized(start)) continue;
    let end = start + 1;
    while (capitalized(end)) end += 1;
    add("capitalized", start, Math.min(end, start + MAX_APP_NAME_WORDS));
    start = end;
  }
  text.forEach((word, index) => {
    if (BEFORE_APP.has(word) && searchable(index + 1)) {
      const length = [1, 2].find((n) => AFTER_APP.has(text[index + n + 1] ?? ""));
      if (length) add("asked", index + 1, index + 1 + length);
    }
    const located = PREPOSITION_CUES.get(word);
    if (located) {
      const at = index + (text[index + 1] === "the" ? 2 : 1);
      const appWord = text.indexOf("app", at);
      const beforeApp =
        appWord > at &&
        appWord - at <= MAX_APP_NAME_WORDS &&
        words.slice(at, appWord).every((_, offset) => searchable(at + offset));
      if (beforeApp) add(located, at, appWord);
      else if (at === text.length - 1 && searchable(at)) add(located, at, at + 1);
    }
    if (text[index + 1] === "s" && searchable(index)) add("possessive", index, index + 1);
    for (let end = index + 2; end <= Math.min(text.length, index + MAX_APP_NAME_WORDS); end += 1) {
      if (searchable(index) && searchable(end - 1)) add("phrase", index, end);
    }
  });
  if (searchable(0)) add("edge", 0, 1);
  if (words.length > 1 && searchable(words.length - 1)) add("edge", words.length - 1, words.length);

  const cue = (candidate: AppCandidate) => APP_CUES[candidate.cue];
  return found
    .sort(
      (a, b) =>
        cue(a).tier - cue(b).tier ||
        a.start - b.start ||
        b.end - a.end ||
        Number(cue(b).reportsMissing) - Number(cue(a).reportsMissing),
    )
    .filter(
      (candidate, index, all) =>
        all.findIndex((other) => other.start === candidate.start && other.end === candidate.end) ===
        index,
    );
}

export function planSearchQuery(query: string): SearchQueryPlan {
  const words = splitWords(query).map((typed) => {
    const text = typed.toLowerCase();
    return {
      typed,
      text,
      stem: STOPWORDS.has(text) || text.length < 2 ? null : stemWord(text),
    };
  });
  return { words, appCandidates: findAppCandidates(words) };
}

const spanText = (plan: SearchQueryPlan, span: WordSpan, field: "text" | "typed" = "text") =>
  plan.words
    .slice(span.start, span.end)
    .map((word) => word[field])
    .join(" ");

function* namesWithin(candidate: AppCandidate): Generator<WordSpan> {
  if (APP_CUES[candidate.cue].wholeSpanOnly) {
    yield candidate;
    return;
  }
  const { start, end } = candidate;
  for (let length = Math.min(MAX_APP_NAME_WORDS, end - start); length >= 1; length -= 1) {
    for (let first = start; first + length <= end; first += 1) {
      yield { start: first, end: first + length };
    }
  }
}

export function appLookupTerms(plan: SearchQueryPlan): string[] {
  const whole = (candidate: AppCandidate) => APP_CUES[candidate.cue].wholeSpanOnly;
  return [
    ...new Set([
      ...plan.appCandidates
        .filter((candidate) => !whole(candidate))
        .flatMap((candidate) => plan.words.slice(candidate.start, candidate.end))
        .map((word) => word.text),
      ...plan.appCandidates.filter(whole).map((candidate) => spanText(plan, candidate)),
    ]),
  ].slice(0, MAX_LOOKUP_TERMS);
}

export function appNameKeys(plan: SearchQueryPlan): string[] {
  return [
    ...new Set(
      plan.appCandidates.flatMap((candidate) =>
        [...namesWithin(candidate)].map((span) => spanText(plan, span)),
      ),
    ),
  ];
}

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
  const { appCandidates: candidates } = plan;
  const named = candidates.map((candidate) => {
    for (const span of namesWithin(candidate)) {
      const key = spanText(plan, span);
      const found = byName.get(key) ?? byLabel.get(key);
      if (found) return { span, apps: found };
    }
    return null;
  });
  const tier = (index: number) => APP_CUES[candidates[index]!.cue].tier;
  const reports = (index: number) => APP_CUES[candidates[index]!.cue].reportsMissing;
  const first = named.findIndex(Boolean);
  const outranked =
    first >= 0 &&
    candidates.some((_, index) => !named[index] && reports(index) && tier(index) < tier(first));
  const chosen = first >= 0 && !outranked ? first : -1;
  const outcomes = candidates.map((_, index): CandidateOutcome => {
    if (index === chosen) return "filter";
    if (named[index]) return "outranked";
    return chosen < 0 && reports(index) ? "missing" : "word";
  });

  const filtered = named[chosen]?.span;
  const within = (span: WordSpan | undefined, index: number) =>
    span !== undefined && index >= span.start && index < span.end;
  const missingStems = new Set(
    candidates.flatMap((candidate, index) =>
      outcomes[index] === "missing"
        ? plan.words.slice(candidate.start, candidate.end).map((word) => word.stem)
        : [],
    ),
  );
  const searchTerms = (scope: SearchScope) => {
    const terms: SearchTerm[] = [];
    plan.words.forEach(({ text, stem }, index) => {
      const appWord = within(filtered, index);
      if (!stem || (appWord && scope === "app") || terms.some((term) => term.stem === stem)) {
        return;
      }
      terms.push(
        missingStems.has(stem)
          ? {
              word: text,
              stem,
              prefixes: [],
              words: [...new Set([text, ...stemPrefixes(stem)])],
              matchesAppColumns: false,
            }
          : {
              word: text,
              stem,
              prefixes: stemPrefixes(stem),
              words: [],
              matchesAppColumns: !appWord,
            },
      );
    });
    const kept = new Set(
      [
        ...terms.filter((term) => !term.matchesAppColumns),
        ...terms.filter((term) => term.matchesAppColumns),
      ].slice(0, MAX_TERMS),
    );
    return terms.filter((term) => kept.has(term));
  };
  const terms = searchTerms("app");
  const searched = new Set(terms.map((term) => term.stem));
  const loose = chosen >= 0 && !APP_CUES[candidates[chosen]!.cue].holdsWithoutResults;

  return {
    candidates: candidates.map((candidate, index) => ({
      ...candidate,
      text: spanText(plan, candidate, "typed"),
      outcome: outcomes[index]!,
    })),
    apps: named[chosen]?.apps ?? [],
    terms,
    anyAppTerms: loose ? searchTerms("anyApp") : null,
    missing: candidates.flatMap((candidate, index) => {
      if (outcomes[index] !== "missing") return [];
      const stems = plan.words
        .slice(candidate.start, candidate.end)
        .flatMap(({ stem }) => (stem && searched.has(stem) ? [stem] : []));
      return stems.length > 0 ? [{ text: spanText(plan, candidate, "typed"), stems }] : [];
    }),
  };
}

/** A candidate is a missing app when no result contains one of its words, so it isn't a feature word. */
export function searchMatch(
  query: ResolvedQuery<NamedApp>,
  mode: SearchMode,
  matchedStems: ReadonlySet<string>,
  scope: SearchScope = "app",
): SearchMatch {
  const terms = scope === "anyApp" ? (query.anyAppTerms ?? query.terms) : query.terms;
  const named = query.apps[0]?.slug ?? null;
  const matched = terms.filter((term) => matchedStems.has(term.stem));
  return {
    mode,
    app: scope === "app" ? named : null,
    appWithoutResults: scope === "anyApp" ? named : null,
    appNotFound:
      query.missing.find((candidate) => candidate.stems.some((stem) => !matchedStems.has(stem)))
        ?.text ?? null,
    matchedTerms: matched.map((term) => term.word),
    unmatchedTerms: terms.filter((term) => !matched.includes(term)).map((term) => term.word),
  };
}
