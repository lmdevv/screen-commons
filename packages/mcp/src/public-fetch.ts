import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import { ImageDownloadError, isLocalOrigin } from "@screen-commons/core";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * The fetch this process downloads image URLs with. The shared downloader only reads a URL's
 * spelling, so a public-looking name can still point at a private address. Here the addresses a
 * name resolves to are checked at connection time, on every hop, and the socket connects only to
 * the answers just checked, so a later DNS answer can't swap them.
 */
const privateV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  privateV4.addSubnet(network, prefix, "ipv4");
}

const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

/**
 * Inside global unicast, but documentation or a tunnel to an embedded IPv4 address. Everything
 * outside 2000::/3 is already refused, which covers loopback, link-local, unique-local, multicast,
 * IPv4-mapped (`::ffff:0:0/96`) and NAT64 (`64:ff9b::/96`) addresses.
 */
const reservedV6 = new BlockList();
reservedV6.addSubnet("2001::", 32, "ipv6");
reservedV6.addSubnet("2001:db8::", 32, "ipv6");
reservedV6.addSubnet("2002::", 16, "ipv6");

/** Whether an address is on the public internet. Anything unrecognised counts as private. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !privateV4.check(address, "ipv4");
  if (family !== 6 || address.includes("%")) return false;
  return globalV6.check(address, "ipv6") && !reservedV6.check(address, "ipv6");
}

interface Answer {
  address: string;
  family: number;
}
type Resolve = (hostname: string) => Promise<Answer[]>;

const resolveAll: Resolve = (hostname) => dnsLookup(hostname, { all: true });

const privateHost = (hostname: string) =>
  new ImageDownloadError(
    "bad_request",
    `${hostname} resolves to a private network address, so it can't be downloaded. Use a public URL or another image source.`,
  );

/**
 * A `net.connect` lookup that refuses a name if any of its answers is private, since a connection
 * can land on any of them. The caller only ever sees the answers checked here.
 */
export function checkedLookup(resolve: Resolve, isPublic = isPublicAddress) {
  return (
    hostname: string,
    options: { all?: boolean },
    callback: (error: Error | null, address?: unknown, family?: number) => void,
  ): void => {
    resolve(hostname).then(
      (answers) => {
        if (answers.length === 0 || answers.some((answer) => !isPublic(answer.address))) {
          callback(privateHost(hostname));
        } else if (options.all) {
          callback(null, answers);
        } else {
          callback(null, answers[0]!.address, answers[0]!.family);
        }
      },
      (error: Error) => callback(error),
    );
  };
}

/** Undici reports a failed connection as `fetch failed`, with the reason as its cause. */
function refusalIn(error: unknown): ImageDownloadError | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current instanceof ImageDownloadError) return current;
  }
  return undefined;
}

export function createPublicFetch(
  options: { resolve?: Resolve; isPublic?: (address: string) => boolean } = {},
): typeof fetch {
  const dispatcher = new Agent({
    connect: { lookup: checkedLookup(options.resolve ?? resolveAll, options.isPublic) as never },
    // No idle sockets: each download is a few requests, and a short-lived process should exit.
    pipelining: 0,
  });
  return async (input, init) => {
    try {
      return (await undiciFetch(input as never, { ...init, dispatcher } as never)) as never;
    } catch (error) {
      throw refusalIn(error) ?? error;
    }
  };
}

let shared: typeof fetch | undefined;

/**
 * How this process fetches an image URL for an instance at `baseUrl`. A local instance is exempt,
 * as in the downloader's own URL check: its image URLs are meant to be on this machine.
 */
export function imageFetchFor(baseUrl: string): typeof fetch {
  if (isLocalOrigin(baseUrl)) return globalThis.fetch.bind(globalThis);
  shared ??= createPublicFetch();
  return shared;
}
