import { describe, expect, it } from "vitest";

import {
  appLookupWords,
  planSearchQuery,
  resolveQuery,
  searchMatch,
  stemWord,
  type NamedApp,
} from "./search-query";

const CATALOG: NamedApp[] = [
  { slug: "spotify", name: "Spotify", host: "open.spotify.com" },
  { slug: "spotify-ios", name: "Spotify", host: "open.spotify.com" },
  { slug: "fixture-tunes", name: "Fixture Tunes", host: "tunes.example" },
  { slug: "linear", name: "Linear", host: "linear.app" },
  { slug: "bbc-news", name: "News", host: "www.bbc.co.uk" },
  { slug: "resend", name: "Resend", host: "resend.com" },
  { slug: "apple-podcasts", name: "Apple Podcasts", host: "podcasts.apple.com" },
];

const resolve = (query: string, apps: NamedApp[] = CATALOG) =>
  resolveQuery(planSearchQuery(query), apps);
const stems = (query: string) => resolve(query).terms.map((term) => term.stem);
const candidates = (query: string) =>
  resolve(query, []).appCandidates.map((candidate) => candidate.text);

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

  it("finds app names by capitals after the first word", () => {
    expect(candidates("How does Apple Music let users create a playlist?")).toEqual([
      "Apple Music",
    ]);
    expect(candidates("How do I cast to Chromecast?")).toEqual(["Chromecast"]);
    expect(candidates("How does the Premium upsell work?")).toEqual(["Premium"]);
    expect(candidates("Netflix download flow")).toEqual([]);
    expect(candidates("How do I make a collaborative playlist?")).toEqual([]);
  });

  it("finds lowercase app names by how a question is phrased", () => {
    expect(candidates("how does netflix handle downloads")).toEqual(["netflix"]);
    expect(candidates("how does tidal let users create a playlist")).toEqual(["tidal"]);
    expect(candidates("how do I export reports in notion")).toEqual(["notion"]);
    expect(candidates("how do I export reports in the notion app")).toEqual(["notion"]);
    expect(candidates("how do users export a report")).toEqual([]);
  });

  it("offers every query word for the app lookup once, candidate words first", () => {
    expect(appLookupWords(planSearchQuery("spotify playlist in Spotify"))).toEqual([
      "spotify",
      "playlist",
      "in",
    ]);
    expect(appLookupWords(planSearchQuery("make a playlist on Tidal"))[0]).toBe("tidal");
  });
});

describe("resolveQuery", () => {
  it("filters to every app with the name the query uses, in any case", () => {
    const query = resolve("spotify add song to queue");
    expect(query.apps.map((app) => app.slug)).toEqual(["spotify", "spotify-ios"]);
    expect(query.terms.map((term) => term.stem)).toEqual(["add", "song", "queu"]);
    expect(query.appCandidates).toEqual([]);
  });

  it("prefers the longest name and falls back to the host label", () => {
    expect(resolve("add songs in the Fixture Tunes app").apps[0]?.slug).toBe("fixture-tunes");
    expect(resolve("tunes playlist").apps[0]?.slug).toBe("fixture-tunes");
    expect(resolve("bbc headlines").apps[0]?.slug).toBe("bbc-news");
    expect(resolve("linear progress bar while uploading").terms.map((t) => t.stem)).toEqual([
      "progres",
      "bar",
      "whil",
      "upload",
    ]);
  });

  it("prefers an app name the question marks as one over a word that is also an app", () => {
    expect(resolve("How do I resend an invite on Spotify?").apps[0]?.slug).toBe("spotify");
    expect(resolve("how do I resend an invite").apps[0]?.slug).toBe("resend");
  });

  it("reads no host label under a company's subdomain", () => {
    const query = resolve("How does Apple Music let users create a playlist?");
    expect(query.apps).toEqual([]);
    expect(query.appCandidates.map((candidate) => candidate.text)).toEqual(["Apple Music"]);
  });

  it("keeps a candidate's words when the query has too many terms", () => {
    const query = resolve(
      "create rename reorder share download delete archive pin sort filter export playlists in Tidal",
      [],
    );
    expect(query.terms).toHaveLength(8);
    expect(query.terms.at(-1)).toEqual({ word: "tidal", stem: "tidal" });
    expect(query.appCandidates).toEqual([{ text: "Tidal", stems: ["tidal"] }]);
  });

  it("keeps an unknown app's words as terms and as a candidate", () => {
    const query = resolve("How does Netflix let users download episodes?");
    expect(query.apps).toEqual([]);
    expect(query.terms.map((term) => term.stem)).toEqual(["netflix", "download", "episod"]);
    expect(query.appCandidates).toEqual([{ text: "Netflix", stems: ["netflix"] }]);
  });

  it("drops candidates once the query names a known app", () => {
    const query = resolve("How do I cancel my Spotify Premium subscription?");
    expect(query.apps[0]?.slug).toBe("spotify");
    expect(query.terms.map((term) => term.stem)).toEqual(["cancel", "premium", "subscription"]);
    expect(query.appCandidates).toEqual([]);
  });
});

describe("searchMatch", () => {
  const netflix = resolve("How does Netflix let users download episodes?");

  it("reports a candidate as missing when no result contains its words", () => {
    expect(searchMatch(netflix, "relaxed", new Set(["download", "episod"]))).toEqual({
      mode: "relaxed",
      app: null,
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
      appNotFound: null,
      matchedTerms: ["create", "playlist"],
      unmatchedTerms: [],
    });
  });
});
