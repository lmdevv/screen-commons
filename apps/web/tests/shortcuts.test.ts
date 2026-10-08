import { readFile } from "node:fs/promises";

import { formatShortcut, parseShortcut } from "@screen-commons/ui/lib/keyboard";
import { describe, expect, it } from "vitest";

import {
  NAV_COMMANDS,
  SHORTCUTS,
  audienceOf,
  commandsFor,
  helpSections,
  matchesCommand,
  type Audience,
  type ShortcutEntry,
} from "../src/lib/shortcuts";

const AUDIENCES: Audience[] = ["signedOut", "member", "admin"];
const ids = (audience: Audience) => commandsFor(audience).map((command) => command.id);

describe("command registry", () => {
  it("parses every key in the registry", () => {
    for (const command of NAV_COMMANDS) {
      if (command.shortcut) expect(() => parseShortcut(command.shortcut!)).not.toThrow();
    }
    for (const entry of Object.values(SHORTCUTS)) {
      expect(() => parseShortcut(entry.keys)).not.toThrow();
    }
  });

  it("gives each audience unique ids and shortcuts", () => {
    for (const audience of AUDIENCES) {
      const commands = commandsFor(audience);
      expect(new Set(ids(audience)).size).toBe(commands.length);
      const keys = commands.flatMap((command) => (command.shortcut ? [command.shortcut] : []));
      expect(new Set(keys).size, audience).toBe(keys.length);
    }
  });

  it("navigates with modifier-free G sequences that no page key shadows", () => {
    const pageKeys = new Set(
      Object.values<ShortcutEntry>(SHORTCUTS).flatMap((entry) =>
        entry.native ? [] : parseShortcut(entry.keys),
      ),
    );
    expect(pageKeys.has("g")).toBe(false); // "g" must stay free to start a sequence
    for (const command of NAV_COMMANDS.filter((item) => item.shortcut)) {
      const chords = parseShortcut(command.shortcut!);
      expect(chords, command.id).toHaveLength(2);
      expect(chords[0], command.id).toBe("g");
      // No ⌘/Ctrl or Alt: those belong to the browser, the OS and the extension (⌥⇧S/V/E).
      for (const chord of chords) expect(chord, command.id).not.toMatch(/^(mod|alt)\+/u);
    }
  });

  it("filters commands by auth state and role", () => {
    expect(ids("signedOut")).toEqual(["home", "docs", "sign-in", "sign-up"]);
    expect(ids("member")).not.toContain("review");
    expect(ids("member")).not.toContain("sign-in");
    expect(ids("member")).toEqual(expect.arrayContaining(["saved", "contribute", "settings"]));
    expect(ids("admin").filter((id) => id !== "review")).toEqual(ids("member"));
    expect(ids("admin")).toContain("review");
    expect(audienceOf(null)).toBe("signedOut");
    expect(audienceOf({ role: "member" })).toBe("member");
    expect(audienceOf({ role: "admin" })).toBe("admin");
  });

  it("keeps the current platform for library destinations", () => {
    const go = (id: string) => NAV_COMMANDS.find((command) => command.id === id)!;
    expect(go("browse-flows").to({ platform: "ios" })).toMatchObject({
      to: "/browse/$platform",
      params: { platform: "ios" },
      search: { tab: "flows" },
    });
    expect(go("discover").to({ platform: "android" })).toMatchObject({
      params: { platform: "android" },
    });
    expect(go("settings-keys").to({ platform: "web" })).toMatchObject({
      to: "/settings",
      search: { tab: "keys" },
    });
  });

  it("matches every query word against label, group and keywords", () => {
    const keys = NAV_COMMANDS.find((command) => command.id === "settings-keys")!;
    expect(matchesCommand(keys, "api")).toBe(true);
    expect(matchesCommand(keys, "Settings TOKENS")).toBe(true);
    expect(matchesCommand(keys, "api flows")).toBe(false);
    expect(matchesCommand(keys, "  ")).toBe(true);
  });
});

describe("shortcut help", () => {
  const titles = (audience: Audience) => helpSections(audience).map((section) => section.title);

  it("only lists what each audience can use", () => {
    expect(titles("signedOut")).toEqual(["Anywhere", "Go to"]);
    expect(titles("member")).toEqual(["Anywhere", "Go to", "Grids", "Screen viewer", "Contribute"]);
    expect(titles("admin")).toEqual([...titles("member"), "Review"]);
    const goTo = (audience: Audience) =>
      helpSections(audience)
        .find((section) => section.title === "Go to")!
        .items.map((item) => item.label);
    expect(goTo("signedOut")).toEqual(["Home", "Docs"]);
    expect(goTo("admin")).toContain("Review queue");
    expect(goTo("member")).not.toContain("Review queue");
  });

  it("is documented in docs/keyboard-shortcuts.md", async () => {
    const markdown = await readFile(
      new URL("../content/docs/keyboard-shortcuts.md", import.meta.url),
      "utf8",
    );
    // Table rows as [keys cell, label cell].
    const rows = markdown
      .split("\n")
      .filter((line) => line.startsWith("|") && !line.startsWith("| -"))
      .map((line) => line.split("|").map((cell) => cell.trim()))
      .map((cells) => [cells[1]!, cells[2]!] as const);
    // Docs spell keys the Windows/Linux way after the macOS one: "`⌘K` / `Ctrl+K`", "`G` then `S`".
    const docKeys = (keys: string) =>
      formatShortcut(keys, false)
        .map((chord) => `\`${chord.join("+")}\``)
        .join(" then ");
    for (const audience of AUDIENCES) {
      for (const section of helpSections(audience)) {
        for (const item of section.items) {
          const documented = rows.some(
            ([keys, label]) => label === item.label && keys.includes(docKeys(item.keys)),
          );
          expect(documented, `${section.title}: ${docKeys(item.keys)} ${item.label}`).toBe(true);
        }
      }
    }
  });
});
