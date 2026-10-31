import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { ImageDownloadError, downloadImage } from "@screen-commons/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkedLookup, createPublicFetch, isPublicAddress } from "../src/public-fetch";

describe("isPublicAddress", () => {
  it.each([
    ["8.8.8.8", true],
    ["1.1.1.1", true],
    ["2606:4700:4700::1111", true],
    ["0.0.0.0", false],
    ["10.1.2.3", false],
    ["100.64.0.1", false],
    ["127.0.0.1", false],
    ["169.254.169.254", false],
    ["172.16.0.1", false],
    ["192.168.1.5", false],
    ["198.18.0.1", false],
    ["224.0.0.1", false],
    ["255.255.255.255", false],
    ["::", false],
    ["::1", false],
    ["fc00::1", false],
    ["fd12:3456::1", false],
    ["fe80::1", false],
    ["fe80::1%eth0", false],
    ["ff02::1", false],
    ["2001:db8::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:10.0.0.1", false],
    ["::ffff:7f00:1", false],
    ["::ffff:8.8.8.8", false],
    ["64:ff9b::a00:1", false],
    ["2002:7f00:1::", false],
    ["2001:0:4136:e378::1", false],
    ["not an address", false],
  ])("%s → %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe("checkedLookup", () => {
  const answer = (addresses: string[]) => (_host: string) =>
    Promise.resolve(
      addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
    );
  const run = (addresses: string[], all: boolean) =>
    new Promise<unknown[]>((resolve) => {
      checkedLookup(answer(addresses))("cdn.example.com", { all }, (...args: unknown[]) =>
        resolve(args),
      );
    });

  it("returns only the validated answers, in the shape the caller asked for", async () => {
    const addresses = ["8.8.8.8", "2606:4700:4700::1111"];
    const [error, all] = await run(addresses, true);
    expect(error).toBeNull();
    expect(all).toEqual([
      { address: "8.8.8.8", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
    expect(await run(addresses, false)).toEqual([null, "8.8.8.8", 4]);
  });

  it.each([
    [["127.0.0.1"]],
    [["::1"]],
    [["::ffff:10.0.0.1"]],
    // One private answer among public ones is enough: the connection could land on any of them.
    [["8.8.8.8", "10.0.0.1"]],
    [["2606:4700:4700::1111", "fd00::1"]],
  ])("refuses %j", async (addresses) => {
    const [error] = await run(addresses, true);
    expect(error).toBeInstanceOf(ImageDownloadError);
    expect((error as ImageDownloadError).code).toBe("bad_request");
    expect((error as ImageDownloadError).message).toContain("cdn.example.com");
    // The internal address never reaches the agent.
    for (const address of addresses) expect((error as Error).message).not.toContain(address);
  });

  it("passes a DNS failure through", async () => {
    const failure = Object.assign(new Error("nope"), { code: "ENOTFOUND" });
    const [error] = await new Promise<unknown[]>((resolve) => {
      checkedLookup(() => Promise.reject(failure))("gone.example.com", {}, (...args: unknown[]) =>
        resolve(args),
      );
    });
    expect(error).toBe(failure);
  });
});

describe("createPublicFetch", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==",
    "base64",
  );
  let server: Server;
  let port: number;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      hits.push(`${request.headers.host}${request.url}`);
      if (request.url === "/hop") {
        response.writeHead(302, { location: `http://private.example.com:${port}/image.png` });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "image/png" });
      response.end(png);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  // allowLocal only opens the URL check for this plain-http fixture; the address check is the
  // injected fetch's own, which is what's under test.
  const resolver = (table: Record<string, string>) => (host: string) =>
    Promise.resolve([{ address: table[host] ?? "8.8.8.8", family: 4 }]);

  it("refuses a public-looking name that resolves to loopback, before connecting", async () => {
    hits.length = 0;
    const fetch = createPublicFetch({
      resolve: resolver({ "private.example.com": "127.0.0.1" }),
    });
    await expect(
      downloadImage(`http://private.example.com:${port}/image.png`, { allowLocal: true, fetch }),
    ).rejects.toMatchObject({
      name: "ImageDownloadError",
      code: "bad_request",
      message: expect.stringContaining("private.example.com resolves to a private"),
    });
    expect(hits).toEqual([]);
  });

  it("checks every redirect hop", async () => {
    hits.length = 0;
    // The first hop's name is allowed through to the fixture; the second resolves privately.
    const allowed = new Set(["127.0.0.1"]);
    const fetch = createPublicFetch({
      resolve: resolver({ "first.example.com": "127.0.0.1", "private.example.com": "10.0.0.1" }),
      isPublic: (address) => allowed.has(address) || isPublicAddress(address),
    });
    await expect(
      downloadImage(`http://first.example.com:${port}/hop`, { allowLocal: true, fetch }),
    ).rejects.toMatchObject({
      code: "bad_request",
      message: expect.stringContaining("private.example.com"),
    });
    expect(hits).toEqual([`first.example.com:${port}/hop`]);
  });

  it("connects to the address it validated, not whatever DNS says next", async () => {
    hits.length = 0;
    let calls = 0;
    const fetch = createPublicFetch({
      // A rebinding answer: only the first answer is what gets validated and used.
      resolve: () => {
        calls += 1;
        return Promise.resolve([{ address: calls === 1 ? "127.0.0.1" : "203.0.113.9", family: 4 }]);
      },
      isPublic: (address) => address === "127.0.0.1",
    });
    // No such name exists, so reaching the fixture proves the socket used the validated answer.
    const bytes = await downloadImage(`http://pinned.invalid.example.com:${port}/image.png`, {
      allowLocal: true,
      fetch,
    });
    expect(Buffer.from(bytes)).toEqual(png);
    expect(calls).toBe(1);
    expect(hits).toEqual([`pinned.invalid.example.com:${port}/image.png`]);
  });
});
