#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const USAGE = `Usage: node scan-personal-data.mjs <manifest.json | text file>

Finds email addresses, phone numbers and card-like numbers in every text a manifest would
publish: titles, screen text, source URLs, tags, flow names and step labels. A file that isn't
JSON is scanned as one text. Prints a JSON report. Exits 0 when it finds nothing, 1 when it
finds something, 2 when it can't read the file.

It only matches patterns. It can't see names, faces or avatars in the images.
`;

const PATTERNS = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gu,
  phone: /\+\d[\d\s().-]{6,}\d|(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/gu,
  card: /\b\d(?:[\s-]?\d){12,18}\b/gu,
};

const digits = (text) => text.replace(/\D/gu, "");

function luhn(number) {
  let sum = 0;
  for (let index = 0; index < number.length; index += 1) {
    let digit = Number(number[number.length - 1 - index]);
    if (index % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
}

const KEEP = {
  email: () => true,
  phone: (match) => digits(match).length >= 8 && digits(match).length <= 15,
  card: (match) => {
    const number = digits(match);
    for (let length = Math.min(number.length, 19); length >= 13; length -= 1) {
      if (luhn(number.slice(0, length))) return true;
    }
    return false;
  },
};

const FILE_ID_AND_TIME_KEYS = new Set([
  "source",
  "localId",
  "id",
  "version",
  "capturedAt",
  "screen",
]);

function* texts(value, path) {
  if (typeof value === "string") yield [path, value];
  else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* texts(item, `${path}[${index}]`);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (!FILE_ID_AND_TIME_KEYS.has(key)) yield* texts(item, path ? `${path}.${key}` : key);
    }
  }
}

const path = process.argv[2];
if (!path || path === "--help" || path === "-h") {
  process.stdout.write(USAGE);
  process.exit(path ? 0 : 2);
}
let raw;
try {
  raw = readFileSync(resolve(path), "utf8");
} catch (error) {
  process.stderr.write(`Can't read ${resolve(path)}: ${error.code ?? error.message}\n`);
  process.exit(2);
}
let document;
try {
  document = JSON.parse(raw);
} catch {
  document = raw;
}

const findings = [];
for (const [where, text] of texts(document, typeof document === "string" ? "text" : "")) {
  for (const [kind, pattern] of Object.entries(PATTERNS)) {
    for (const [match] of text.matchAll(pattern)) {
      if (KEEP[kind](match)) findings.push({ path: where, kind, match: match.trim() });
    }
  }
}
const ok = findings.length === 0;
process.stdout.write(`${JSON.stringify({ ok, file: resolve(path), findings }, null, 2)}\n`);
if (!ok) {
  process.stderr.write(
    `Found ${findings.map(({ kind, match }) => `${kind} ${match}`).join(", ")}. Don't publish this\n`,
  );
}
process.exitCode = ok ? 0 : 1;
