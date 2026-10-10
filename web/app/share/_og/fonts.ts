import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * OG fonts, as buffers. Satori (`next/og`) reads TTF/OTF/WOFF only — never the
 * WOFF2 the site serves — and cannot drive a variable font's axes, so these are
 * static TTFs derived from the same self-hosted subsets by `scripts/og-fonts.py`.
 * Same glyphs, same OFL 1.1 licence; no third-party font request (TYPE.md §8).
 */

export const OG_FONT = {
  display: 'Bebas Neue',
  athletic: 'Rajdhani',
  num: 'Inter',
} as const;

type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700;
  style: 'normal';
};

let fontsPromise: Promise<OgFont[]> | null = null;

async function load(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(process.cwd(), 'public', 'fonts', 'og', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function ogFonts(): Promise<OgFont[]> {
  fontsPromise ??= (async () => {
    const [bebas, rajdhani, inter500, inter700] = await Promise.all([
      load('bebas-neue-400.ttf'),
      load('rajdhani-600.ttf'),
      load('inter-500.ttf'),
      load('inter-700.ttf'),
    ]);
    return [
      { name: OG_FONT.display, data: bebas, weight: 400, style: 'normal' },
      { name: OG_FONT.athletic, data: rajdhani, weight: 600, style: 'normal' },
      { name: OG_FONT.num, data: inter500, weight: 500, style: 'normal' },
      { name: OG_FONT.num, data: inter700, weight: 700, style: 'normal' },
    ];
  })();
  return fontsPromise;
}
