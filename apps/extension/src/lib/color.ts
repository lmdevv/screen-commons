/**
 * Dominant colour of an RGBA pixel buffer (typically a ~24x24 downsample): pixels are bucketed
 * at 4 bits per channel, the most common bucket wins and its members are averaged.
 * Fully transparent pixels are ignored. Returns `#rrggbb` or null when nothing is opaque.
 */
export function dominantColor(rgba: ArrayLike<number>): string | null {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let index = 0; index + 3 < rgba.length; index += 4) {
    const alpha = rgba[index + 3]!;
    if (alpha < 128) continue;
    const r = rgba[index]!;
    const g = rgba[index + 1]!;
    const b = rgba[index + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = counts.get(key);
    if (bucket) {
      bucket.n += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      counts.set(key, { n: 1, r, g, b });
    }
  }
  let best: { n: number; r: number; g: number; b: number } | undefined;
  for (const bucket of counts.values()) if (!best || bucket.n > best.n) best = bucket;
  if (!best) return null;
  const hex = (value: number) =>
    Math.round(value / best.n)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}
