import { describe, expect, it } from "vitest";

import {
  appNameKeys,
  planSearchQuery,
  resolveQuery,
  searchMatch,
  stemPrefixes,
  stemWord,
  type NamedApp,
} from "./search-query";

const CATALOG: NamedApp[] = [
  { slug: "spotify", name: "Spotify" },
  { slug: "spotify-ios", name: "Spotify" },
  { slug: "fixture-tunes", name: "Fixture Tunes" },
  { slug: "linear", name: "Linear" },
  { slug: "linear-ios", name: "Linear" },
  { slug: "vercel", name: "Vercel" },
  { slug: "supabase", name: "Supabase" },
  { slug: "resend", name: "Resend" },
  { slug: "stripe", name: "Stripe" },
  { slug: "pitch", name: "Pitch" },
  { slug: "squarespace", name: "Squarespace" },
  { slug: "apple-podcasts", name: "Apple Podcasts" },
  { slug: "cal-com", name: "Cal.com" },
  { slug: "the-athletic", name: "The Athletic" },
  { slug: "x", name: "X" },
];

const resolve = (query: string, apps: NamedApp[] = CATALOG) =>
  resolveQuery(planSearchQuery(query), apps);
const words = (query: string) => resolve(query).terms.map((term) => term.word);
const named = (query: string) => {
  const { apps, holdsWithoutResults } = resolve(query);
  return { apps: apps.map((app) => app.slug), holds: holdsWithoutResults };
};
const missing = (query: string) => resolve(query).missingApps.map((name) => name.text);

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
    expect(words("How does Fixture Tunes let users create a playlist?")).toEqual([
      "create",
      "playlist",
    ]);
    expect(words("Show me the onboarding flow steps of this app")).toEqual(["onboarding"]);
  });

  it("keeps like, new and make searchable", () => {
    expect(words("make a new playlist I like")).toEqual(["make", "new", "playlist", "like"]);
  });

  it("folds case and diacritics the way the index does", () => {
    const [word] = planSearchQuery("Réglages").words;
    expect(word).toEqual({ typed: "Reglages", text: "reglages", stem: "reglag" });
    expect(planSearchQuery("プレイリストを作成").words.map((each) => each.text)).toEqual([
      "プレイリストを作成",
    ]);
  });

  it("searches each stem once and skips single letters", () => {
    expect(words("Spotify's playlists and playlist folders")).toEqual(["playlists", "folders"]);
  });

  it("finds no word to search for in a question made only of skipped words", () => {
    expect(resolve("how does it work")).toEqual({
      apps: [],
      holdsWithoutResults: false,
      terms: [],
      missingApps: [],
    });
  });

  it("looks up every run of words as a name or a slug, including stopwords and single letters", () => {
    const keys = appNameKeys(planSearchQuery("How does The Athletic let X post?"));
    expect(keys.names).toEqual(expect.arrayContaining(["athletic", "the athletic", "x"]));
    expect(keys.names).not.toContain("the");
    expect(keys.slugs).toEqual(expect.arrayContaining(["the-athletic", "x"]));
  });
});

describe("resolveQuery", () => {
  it("names an app only by a visible app's name or slug, in any case", () => {
    for (const query of ["Linear Cycles view", "LINEAR create issue", "linear: create issue"]) {
      expect(named(query)).toEqual({ apps: ["linear", "linear-ios"], holds: true });
    }
    expect(named("linear ios create issue")).toEqual({ apps: ["linear-ios"], holds: true });
    expect(named("booking page in cal.com")).toEqual({ apps: ["cal-com"], holds: true });
    expect(words("Linear Cycles view")).toEqual(["cycles", "view"]);
  });

  it("never reads an app or a missing app from capitals alone", () => {
    for (const query of [
      "How to Download Episodes",
      "How to Create a Playlist",
      "Stripe Checkout page",
      "Supabase Auth settings",
      "Spotify Blend invite",
    ]) {
      expect(missing(query)).toEqual([]);
    }
    expect(named("How to Create a Playlist")).toEqual({ apps: [], holds: false });
    expect(words("How to Download Episodes")).toEqual(["download", "episodes"]);
    expect(named("Stripe Checkout page")).toEqual({ apps: ["stripe"], holds: true });
    expect(named("Spotify Blend invite")).toEqual({
      apps: ["spotify", "spotify-ios"],
      holds: true,
    });
  });

  it("holds a name in the first or last word, after does, in, on, for or my, or before 's, app or flows", () => {
    for (const query of [
      "vercel deploy on push",
      "create issue linear",
      "in linear, how do I create an issue",
      "How does Linear let users create an issue?",
      "what's new on the linear roadmap",
      "Linear's issue templates",
      "how do I create an issue in the linear app",
      "Show me Spotify flows for playlist folders",
      "How do I cancel my Spotify Premium subscription?",
      "zebra stripe",
      "linear progress bar",
    ]) {
      expect(named(query).holds, query).toBe(true);
    }
    expect(missing("vercel deploy on push")).toEqual([]);
  });

  it("reads a name between other words loosely", () => {
    expect(named("how do I resend an invite")).toEqual({ apps: ["resend"], holds: false });
    expect(words("how do I resend an invite")).toEqual(["invite"]);
    expect(named("zebra stripe rows")).toEqual({ apps: ["stripe"], holds: false });
    expect(named("show me a linear progress bar")).toEqual({
      apps: ["linear", "linear-ios"],
      holds: false,
    });
    expect(named("How do I join a Spotify Blend?").holds).toBe(false);
  });

  it("prefers a name that holds, then the longest", () => {
    expect(named("add songs in the Fixture Tunes app").apps).toEqual(["fixture-tunes"]);
    expect(named("subscribing to a show on apple podcasts").apps).toEqual(["apple-podcasts"]);
    expect(named("share a Spotify playlist on Linear")).toEqual({
      apps: ["linear", "linear-ios"],
      holds: true,
    });
  });

  it("names apps that start with a stopword or are one letter", () => {
    expect(named("How does The Athletic let users follow a team?")).toEqual({
      apps: ["the-athletic"],
      holds: true,
    });
    expect(named("How does X let users post?")).toEqual({ apps: ["x"], holds: true });
  });

  it("finds a plural with the singular form, and the other way round", () => {
    const query = resolve("Spotify stories");
    expect(query.apps[0]?.slug).toBe("spotify");
    expect(query.terms).toEqual([{ word: "stories", stem: "story", wholeWord: false }]);
  });

  it("reports a name a strong cue asks about that no app has, as a whole word", () => {
    const line = resolve("How does LINE let users create a group?");
    expect(line.apps).toEqual([]);
    expect(line.missingApps).toEqual([{ text: "LINE", stems: ["lin"] }]);
    expect(line.terms[0]).toEqual({ word: "line", stem: "lin", wholeWord: true });
    expect(missing("How does Square let users take a payment?")).toEqual(["Square"]);
    expect(missing("how does netflix handle downloads")).toEqual(["netflix"]);
    expect(missing("HOW DOES NETFLIX LET USERS DOWNLOAD EPISODES")).toEqual(["NETFLIX"]);
    expect(missing("How Does Netflix Let Users Download Episodes?")).toEqual(["Netflix"]);
    expect(missing("How does Apple Music let users create a playlist?")).toEqual(["Apple Music"]);
    expect(missing("Netflix's download flow")).toEqual(["Netflix"]);
    expect(missing("how do I download episodes on netflix")).toEqual(["netflix"]);
    expect(missing("download episodes in the Netflix app")).toEqual(["Netflix"]);
  });

  it("ends a name without a known verb at the capitals of a mixed-case question", () => {
    expect(missing("How does YouTube Music recommend songs?")).toEqual(["YouTube Music"]);
    expect(missing("How does Netflix recommend shows?")).toEqual(["Netflix"]);
    expect(missing("how does apple music let users create a playlist")).toEqual(["apple music"]);
    expect(missing("how does youtube music recommend songs")).toEqual([]);
    expect(missing("How Does YouTube Music Recommend Songs")).toEqual([]);
    expect(missing("How does pagination work?")).toEqual([]);
  });

  it("reads no missing app from a UI word, a skipped word or a plain query", () => {
    for (const query of [
      "tooltip on hover",
      "How do apps show a tooltip on hover?",
      "show error on submit",
      "zoom in on map",
      "how do I sign in on mobile",
      "dark mode in settings",
      "playlist AND OR NOT",
      "How do streaming services let users download episodes?",
      "download songs for offline listening",
      "Netflix download flow",
    ]) {
      expect(missing(query), query).toEqual([]);
    }
  });

  it("reports the app a question asks about rather than a name it uses in passing", () => {
    const netflix = resolve("How does Netflix handle linear playback?");
    expect(netflix.apps).toEqual([]);
    expect(netflix.missingApps.map((name) => name.text)).toEqual(["Netflix"]);
    expect(netflix.terms.find((term) => term.word === "linear")?.wholeWord).toBe(false);
    expect(missing("How does Netflix let users play Spotify playlists?")).toEqual(["Netflix"]);
    expect(named("Spotify share on Instagram")).toEqual({
      apps: ["spotify", "spotify-ios"],
      holds: true,
    });
    expect(missing("Spotify share on Instagram")).toEqual([]);
  });

  it("keeps a missing name's words when the query has too many terms", () => {
    const query = resolve(
      "create rename reorder share download delete archive pin sort filter export playlists in Tidal",
    );
    expect(query.terms).toHaveLength(8);
    expect(query.terms.at(-1)).toEqual({
      word: "tidal",
      stem: "tidal",
      wholeWord: true,
    });
    expect(query.missingApps).toEqual([{ text: "Tidal", stems: ["tidal"] }]);
  });

  it("holds an app given outside the query and reports no missing app", () => {
    const spotify = CATALOG.filter((app) => app.slug === "spotify");
    const query = resolveQuery(
      planSearchQuery("How does Netflix let users find spotify playlists?"),
      spotify,
      true,
    );
    expect(query).toMatchObject({ apps: spotify, holdsWithoutResults: true, missingApps: [] });
    expect(query.terms.map((term) => term.word)).toEqual(["netflix", "playlists"]);
  });
});

describe("searchMatch", () => {
  const netflix = resolve("How does Netflix let users download episodes?");

  it("reports a missing name when no result contains its words", () => {
    expect(searchMatch(netflix, "relaxed", new Set(["download", "episod"]), false)).toEqual({
      mode: "relaxed",
      app: null,
      appWithoutResults: null,
      appNotFound: "Netflix",
      matchedTerms: ["download", "episodes"],
      unmatchedTerms: ["netflix"],
    });
  });

  it("reads a missing name some result contains as an ordinary word", () => {
    const merge = resolve("deploy on merge");
    expect(merge.missingApps).toEqual([{ text: "merge", stems: ["merg"] }]);
    expect(searchMatch(merge, "strict", new Set(["deploy", "merg"]), false)).toMatchObject({
      appNotFound: null,
      matchedTerms: ["deploy", "merge"],
    });
    const netflixWord = searchMatch(
      netflix,
      "strict",
      new Set(["netflix", "download", "episod"]),
      false,
    );
    expect(netflixWord.appNotFound).toBeNull();
  });

  it("names the app the results come from", () => {
    const spotify = resolve("How does Spotify let users create a playlist?");
    expect(searchMatch(spotify, "strict", new Set(["creat", "playlist"]), true)).toEqual({
      mode: "strict",
      app: "spotify",
      appWithoutResults: null,
      appNotFound: null,
      matchedTerms: ["create", "playlist"],
      unmatchedTerms: [],
    });
  });

  it("names a loosely named app that had no results when every app answers instead", () => {
    const resend = resolve("how do I resend an invite");
    expect(searchMatch(resend, "relaxed", new Set(["invit"]), false)).toEqual({
      mode: "relaxed",
      app: null,
      appWithoutResults: "resend",
      appNotFound: null,
      matchedTerms: ["invite"],
      unmatchedTerms: [],
    });
  });
});
