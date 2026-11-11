import { describe, expect, it } from "vitest";

import {
  appLookupTerms,
  appNameKeys,
  planSearchQuery,
  resolveQuery,
  searchMatch,
  stemPrefixes,
  stemWord,
  type AppCue,
  type NamedApp,
} from "./search-query";

const CATALOG: NamedApp[] = [
  { slug: "spotify", name: "Spotify", host: "open.spotify.com" },
  { slug: "spotify-ios", name: "Spotify", host: "open.spotify.com" },
  { slug: "fixture-tunes", name: "Fixture Tunes", host: "tunes.example" },
  { slug: "linear", name: "Linear", host: "linear.app" },
  { slug: "bbc-news", name: "News", host: "www.bbc.co.uk" },
  { slug: "resend", name: "Resend", host: "resend.com" },
  { slug: "stripe", name: "Stripe", host: "stripe.com" },
  { slug: "pitch", name: "Pitch", host: "pitch.com" },
  { slug: "arc", name: "Arc", host: "arc.net" },
  { slug: "squarespace", name: "Squarespace", host: "www.squarespace.com" },
  { slug: "apple-podcasts", name: "Apple Podcasts", host: "podcasts.apple.com" },
];

const resolve = (query: string, apps: NamedApp[] = CATALOG) =>
  resolveQuery(planSearchQuery(query), apps);
const stems = (query: string) => resolve(query).terms.map((term) => term.stem);
const slugs = (query: string) => resolve(query).apps.map((app) => app.slug);
const missing = (query: string) => resolve(query).missing.map((candidate) => candidate.text);
const cues = (query: string) =>
  resolve(query, [])
    .candidates.filter((candidate) => candidate.cue !== "phrase")
    .map((candidate): [string, AppCue] => [candidate.text, candidate.cue]);

describe("stemWord", () => {
  it("strips one suffix so every form shares a prefix", () => {
    expect(stemWord("creating")).toBe("creat");
    expect(stemWord("create")).toBe("creat");
    expect(stemWord("playlists")).toBe("playlist");
    expect(stemWord("episodes")).toBe("episod");
    expect(stemWord("notifications")).toBe("notific");
    expect(stemWord("liked")).toBe("lik");
  });

  it("maps ies to y and undoubles a final consonant", () => {
    expect(stemWord("stories")).toBe("story");
    expect(stemWord("shopping")).toBe("shop");
    expect(stemWord("cancelling")).toBe("cancel");
    expect(stemWord("canceling")).toBe("cancel");
  });

  it("keeps at least 3 characters", () => {
    expect(stemWord("added")).toBe("add");
    expect(stemWord("new")).toBe("new");
    expect(stemWord("bed")).toBe("bed");
  });
});

describe("stemPrefixes", () => {
  it("also searches a consonant and y as ie, so singular and plural find each other", () => {
    expect(stemPrefixes(stemWord("stories"))).toEqual(["story", "storie"]);
    expect(stemPrefixes(stemWord("story"))).toEqual(["story", "storie"]);
    expect(stemPrefixes(stemWord("cookies"))).toEqual(["cooky", "cookie"]);
    expect(stemPrefixes(stemWord("movies"))).toEqual(["movy", "movie"]);
    expect(stemPrefixes(stemWord("series"))).toEqual(["sery", "serie"]);
    expect(stemPrefixes(stemWord("calories"))).toEqual(["calory", "calorie"]);
  });

  it("leaves a vowel and y, and short stems, alone", () => {
    expect(stemPrefixes("play")).toEqual(["play"]);
    expect(stemPrefixes("fly")).toEqual(["fly"]);
    expect(stemPrefixes("playlist")).toEqual(["playlist"]);
  });
});

describe("planSearchQuery", () => {
  it("drops question words, catalog words and the people a feature is for", () => {
    expect(stems("How does Fixture Tunes let users create a playlist?")).toEqual([
      "creat",
      "playlist",
    ]);
    expect(stems("Show me the onboarding flow steps of this app")).toEqual(["onboard"]);
  });

  it("keeps like, new and make searchable", () => {
    expect(stems("make a new playlist I like")).toEqual(["mak", "new", "playlist", "lik"]);
  });

  it("folds case and diacritics the way the index does", () => {
    const [word] = planSearchQuery("Réglages").words;
    expect(word).toEqual({ typed: "Reglages", text: "reglages", stem: "reglag" });
    expect(planSearchQuery("プレイリストを作成").words.map((each) => each.text)).toEqual([
      "プレイリストを作成",
    ]);
  });

  it("searches each stem once and skips single letters", () => {
    expect(stems("Spotify's playlists and playlist folders")).toEqual(["playlist", "folder"]);
  });

  it("finds no word to search for in a question made only of skipped words", () => {
    const query = resolve("how does it work");
    expect(query.terms).toEqual([]);
    expect(query.apps).toEqual([]);
    expect(query.missing).toEqual([]);
  });

  it("finds app names by capitals after the first word, up to a skipped word", () => {
    expect(cues("How does Apple Music let users create a playlist?")).toContainEqual([
      "Apple Music",
      "asked",
    ]);
    expect(cues("How do I cast to Chromecast?")).toEqual([["Chromecast", "capitalized"]]);
    expect(cues("How do I join a Spotify Blend?")).toContainEqual(["Spotify Blend", "capitalized"]);
    expect(cues("How does the Premium upsell work?")).toContainEqual(["Premium", "capitalized"]);
    expect(cues("Netflix download flow")).toEqual([["Netflix", "edge"]]);
    expect(cues("How do I make a collaborative playlist?")).toEqual([["playlist", "edge"]]);
  });

  it("reads no app from capitals when every word is capitalized", () => {
    expect(cues("How Does Netflix Let Users Download Episodes?")).toEqual([
      ["Netflix", "asked"],
      ["Episodes", "edge"],
    ]);
    expect(cues("HOW DOES NETFLIX LET USERS DOWNLOAD EPISODES")).toEqual([
      ["NETFLIX", "asked"],
      ["EPISODES", "edge"],
    ]);
    expect(cues("NOT AND OR NEAR").filter(([, cue]) => cue !== "edge")).toEqual([]);
  });

  it("keeps a capitalized run to four words", () => {
    expect(cues("tips for New York Times Crossword Puzzle Archive")).toContainEqual([
      "New York Times Crossword",
      "capitalized",
    ]);
  });

  it("finds lowercase app names by how a question is phrased", () => {
    expect(cues("how does netflix handle downloads")).toEqual([
      ["netflix", "asked"],
      ["downloads", "edge"],
    ]);
    expect(cues("how does tidal let users create a playlist")).toContainEqual(["tidal", "asked"]);
    expect(cues("how do I export reports in notion")).toEqual([["notion", "located"]]);
    expect(cues("how do I export reports in the notion app")).toContainEqual(["notion", "located"]);
    expect(cues("how do I add songs in the fixture tunes app")).toContainEqual([
      "fixture tunes",
      "located",
    ]);
    expect(cues("show me spotify's playlist folders")).toContainEqual(["spotify", "possessive"]);
    expect(cues("how do users export a report")).toEqual([["report", "edge"]]);
  });

  it("takes the first and last word as possible app names, and no word between", () => {
    expect(cues("spotify lyrics")).toEqual([
      ["spotify", "edge"],
      ["lyrics", "edge"],
    ]);
    expect(cues("how do I resend an invite")).toEqual([["invite", "edge"]]);
  });

  it("looks up only candidate words, then phrases, in app names", () => {
    const plan = planSearchQuery("how do I resend an invite");
    expect(appLookupTerms(plan)).toEqual(["invite", "resend an invite"]);
    expect(appLookupTerms(planSearchQuery("make a playlist on Tidal"))[0]).toBe("tidal");
    expect(appNameKeys(planSearchQuery("How do I join a Spotify Blend?"))).toEqual(
      expect.arrayContaining(["spotify blend", "spotify", "blend"]),
    );
  });
});

describe("resolveQuery", () => {
  it("filters to every app with the name the query uses, in any case", () => {
    const query = resolve("spotify add song to queue");
    expect(query.apps.map((app) => app.slug)).toEqual(["spotify", "spotify-ios"]);
    expect(query.terms.map((term) => term.stem)).toEqual(["add", "song", "queu"]);
    expect(query.missing).toEqual([]);
  });

  it("prefers the longest name and falls back to the host label", () => {
    expect(slugs("add songs in the Fixture Tunes app")[0]).toBe("fixture-tunes");
    expect(slugs("tunes playlist")[0]).toBe("fixture-tunes");
    expect(slugs("bbc headlines")[0]).toBe("bbc-news");
  });

  it("matches a name of several words anywhere in the query", () => {
    expect(slugs("add songs from fixture tunes to my playlist")).toEqual(["fixture-tunes"]);
    expect(slugs("subscribing to a show on apple podcasts")).toEqual(["apple-podcasts"]);
  });

  it("reads an app name between other words as an ordinary word", () => {
    const resend = resolve("how do I resend an invite");
    expect(resend.apps).toEqual([]);
    expect(resend.terms.map((term) => term.stem)).toEqual(["resend", "invit"]);
    expect(slugs("zebra stripe rows")).toEqual([]);
    expect(slugs("How do I resend an invite on Spotify?")).toEqual(["spotify", "spotify-ios"]);
  });

  it("searches every app, with a loosely named app's name as a word, when the app can't answer", () => {
    for (const [question, slug] of [
      ["linear progress bar", "linear"],
      ["pitch deck builder", "pitch"],
      ["arc chart", "arc"],
    ]) {
      const query = resolve(question!);
      expect(query.apps.map((app) => app.slug)).toEqual([slug]);
      expect(query.terms.map((term) => term.word)).not.toContain(slug);
      expect(query.anyAppTerms?.find((term) => term.word === slug)?.matchesAppColumns).toBe(false);
    }
  });

  it("keeps a firmly named app's filter when the app can't answer", () => {
    expect(resolve("How does Linear let users make a progress bar?").anyAppTerms).toBeNull();
    expect(cues("How do I log out of spotify")).toEqual([["spotify", "trailing"]]);
    expect(resolve("How do I log out of spotify").anyAppTerms).toBeNull();
    expect(resolve("how does netflix handle downloads").anyAppTerms).toBeNull();
  });

  it("finds a plural with the singular form, and the other way round", () => {
    const query = resolve("Spotify stories");
    expect(query.apps[0]?.slug).toBe("spotify");
    expect(query.terms).toEqual([
      {
        word: "stories",
        stem: "story",
        prefixes: ["story", "storie"],
        words: [],
        matchesAppColumns: true,
      },
    ]);
  });

  it("reports an app whose name only starts another app's name", () => {
    const line = resolve("How does LINE let users create a group?");
    expect(line.apps).toEqual([]);
    expect(line.missing).toEqual([{ text: "LINE", stems: ["lin"] }]);
    expect(line.terms[0]).toEqual({
      word: "line",
      stem: "lin",
      prefixes: [],
      words: ["line", "lin"],
      matchesAppColumns: false,
    });
    expect(missing("How does Square let users take a payment?")).toEqual(["Square"]);
  });

  it("reports the app a question asks about rather than switching to another", () => {
    const netflix = resolve("How does Netflix handle linear playback?");
    expect(netflix.apps).toEqual([]);
    expect(netflix.missing.map((candidate) => candidate.text)).toEqual(["Netflix"]);

    const both = resolve("How does Netflix let users play Spotify playlists?");
    expect(both.apps).toEqual([]);
    expect(both.missing.map((candidate) => candidate.text)).toEqual(["Netflix"]);
    expect(both.candidates.find((candidate) => candidate.text === "Spotify")?.outcome).toBe(
      "outranked",
    );
  });

  it("reports a missing app from an all-caps question by its name alone", () => {
    expect(missing("HOW DOES NETFLIX LET USERS DOWNLOAD EPISODES")).toEqual(["NETFLIX"]);
    expect(missing("How Does Netflix Let Users Download Episodes?")).toEqual(["Netflix"]);
    expect(missing("NOT AND OR NEAR")).toEqual([]);
  });

  it("reads no host label under a company's subdomain", () => {
    const query = resolve("How does Apple Music let users create a playlist?");
    expect(query.apps).toEqual([]);
    expect(query.missing.map((candidate) => candidate.text)).toEqual(["Apple Music"]);
  });

  it("keeps a candidate's words when the query has too many terms", () => {
    const query = resolve(
      "create rename reorder share download delete archive pin sort filter export playlists in Tidal",
      [],
    );
    expect(query.terms).toHaveLength(8);
    expect(query.terms.at(-1)).toMatchObject({
      word: "tidal",
      stem: "tidal",
      matchesAppColumns: false,
    });
    expect(query.missing).toEqual([{ text: "Tidal", stems: ["tidal"] }]);
  });

  it("keeps an unknown app's words as terms and as a candidate", () => {
    const query = resolve("How does Netflix let users download episodes?");
    expect(query.apps).toEqual([]);
    expect(query.terms.map((term) => [term.stem, term.matchesAppColumns])).toEqual([
      ["netflix", false],
      ["download", true],
      ["episod", true],
    ]);
    expect(query.missing).toEqual([{ text: "Netflix", stems: ["netflix"] }]);
  });

  it("drops candidates once the query names a known app", () => {
    const query = resolve("How do I cancel my Spotify Premium subscription?");
    expect(query.apps[0]?.slug).toBe("spotify");
    expect(query.terms.map((term) => term.stem)).toEqual(["cancel", "premium", "subscription"]);
    expect(query.missing).toEqual([]);
  });
});

describe("searchMatch", () => {
  const netflix = resolve("How does Netflix let users download episodes?");

  it("reports a candidate as missing when no result contains its words", () => {
    expect(searchMatch(netflix, "relaxed", new Set(["download", "episod"]))).toEqual({
      mode: "relaxed",
      app: null,
      appWithoutResults: null,
      appNotFound: "Netflix",
      matchedTerms: ["download", "episodes"],
      unmatchedTerms: ["netflix"],
    });
  });

  it("treats a candidate some result contains as an ordinary word", () => {
    const premium = resolve("How does the Premium upsell work?");
    expect(searchMatch(premium, "relaxed", new Set(["premium"]))).toMatchObject({
      appNotFound: null,
      matchedTerms: ["premium"],
      unmatchedTerms: ["upsell"],
    });
  });

  it("names the app the results are filtered to", () => {
    const spotify = resolve("How does Spotify let users create a playlist?");
    expect(searchMatch(spotify, "strict", new Set(["creat", "playlist"]))).toEqual({
      mode: "strict",
      app: "spotify",
      appWithoutResults: null,
      appNotFound: null,
      matchedTerms: ["create", "playlist"],
      unmatchedTerms: [],
    });
  });

  it("names the app that had no results when every app answers instead", () => {
    const linear = resolve("linear progress bar");
    expect(searchMatch(linear, "relaxed", new Set(["progres", "bar"]), "anyApp")).toEqual({
      mode: "relaxed",
      app: null,
      appWithoutResults: "linear",
      appNotFound: null,
      matchedTerms: ["progress", "bar"],
      unmatchedTerms: ["linear"],
    });
  });
});
