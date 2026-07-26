/**
 * Build preparation — runs as `predev` / `prebuild`.
 *
 * Two jobs, both of which exist because the repo is polyglot (`etl/` Python,
 * `web/` Node) and Next.js can only serve what lives under `web/`:
 *
 *   1. ASSET MIRROR. The asset pipeline writes team logos and player photos to
 *      the repo-root `public/assets/`. Next serves `web/public/`, so this copies
 *      (content-hash cheap: size + mtime) `../public/assets` -> `web/public/assets`.
 *      The mirror is gitignored; the repo-root copy stays the source of truth so
 *      `etl/assets.py` never has to know the app exists.
 *
 *   2. THE FLAG BRIDGE. `etl/config.py` is the single home for the GATE #3 flags
 *      (ARCHITECTURE.md §8, DECISIONS 63: each must stay a one-line reversal).
 *      TypeScript cannot import Python, so this parses the four flag literals out
 *      of `etl/config.py` and writes `lib/generated/flags.json`. Environment
 *      variables still win at runtime (see lib/flags.ts) — the JSON is the
 *      shipping default, not an override.
 *
 * Both steps are idempotent and safe to run when the repo root is absent (a
 * deploy that ships only `web/`): the mirror is skipped and the previously
 * generated flags.json is kept.
 */

import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(WEB, '..');

const log = (...a) => console.log('[prepare]', ...a);

/* ------------------------------------------------------------------ */
/* 1. Asset mirror                                                     */
/* ------------------------------------------------------------------ */

async function mirrorAssets() {
  const src = path.join(REPO, 'public', 'assets');
  const dest = path.join(WEB, 'public', 'assets');
  if (!existsSync(src)) {
    log(`no repo-root public/assets — skipping mirror (existing mirror kept: ${existsSync(dest)})`);
    return;
  }
  const srcStat = await stat(src);
  if (existsSync(dest)) {
    const destStat = await stat(dest);
    if (destStat.mtimeMs >= srcStat.mtimeMs) {
      log('asset mirror up to date');
      return;
    }
  }
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true, force: true });
  log(`asset mirror refreshed -> web/public/assets`);
}

/* ------------------------------------------------------------------ */
/* 2. The etl/config.py -> flags.json bridge                            */
/* ------------------------------------------------------------------ */

/** Pull `NAME = _env("NAME", "default")` / `NAME = <literal>` out of etl/config.py. */
function parsePyFlags(source) {
  const envDefault = (name) => {
    const m = source.match(
      new RegExp(`^${name}\\s*=\\s*_env\\(\\s*"${name}"\\s*,\\s*"([^"]*)"\\s*\\)`, 'm'),
    );
    return m ? m[1] : null;
  };
  const intEnvDefault = (name) => {
    const m = source.match(
      new RegExp(`^${name}\\s*=\\s*int\\(_env\\(\\s*"${name}"\\s*,\\s*"([^"]*)"\\s*\\)\\)`, 'm'),
    );
    return m ? Number(m[1]) : null;
  };
  const boolEnvDefault = (name) => {
    const m = source.match(new RegExp(`^${name}\\s*=\\s*_env\\(\\s*"${name}"\\s*,\\s*"([^"]*)"`, 'm'));
    if (!m) return null;
    return ['1', 'true', 'yes', 'on'].includes(m[1].trim().toLowerCase());
  };

  const killswitch = boolEnvDefault('TEAMMARK_KILLSWITCH');
  const tierRaw = (envDefault('DEAD_MONEY_TIER') ?? 'full').toLowerCase();
  const tier = ['safe', 'safe_only', 'safe-only'].includes(tierRaw) ? 'SAFE_ONLY' : 'ALL';

  return {
    // SPEC §5.1 — the app-side flag is the INVERSE of the ETL kill-switch.
    TEAM_LOGOS_ENABLED: killswitch === null ? true : !killswitch,
    // SPEC §7.5 — both spellings are live; the app uses the SPEC spelling.
    DEAD_MONEY_TIER: tier,
    // SPEC §5.2 OPEN DECISION 1 — the PlayerMark resolution floor.
    IMAGE_MIN_WIDTH_PX: intEnvDefault('IMAGE_MIN_WIDTH_PX') ?? 300,
    // SPEC §5.2 OPEN DECISION 2 — option (a), CSS-filter-only.
    IMAGE_TREATMENT_MODE: envDefault('IMAGE_TREATMENT_MODE') ?? 'css_filter_only',
  };
}

async function bridgeFlags() {
  const cfg = path.join(REPO, 'etl', 'config.py');
  const out = path.join(WEB, 'lib', 'generated', 'flags.json');
  await mkdir(path.dirname(out), { recursive: true });

  if (!existsSync(cfg)) {
    if (existsSync(out)) {
      log('etl/config.py absent — keeping existing lib/generated/flags.json');
      return;
    }
    log('etl/config.py absent and no flags.json — writing shipping defaults');
    await writeFile(
      out,
      JSON.stringify(
        {
          _source: 'defaults (etl/config.py unavailable at build time)',
          TEAM_LOGOS_ENABLED: true,
          DEAD_MONEY_TIER: 'ALL',
          IMAGE_MIN_WIDTH_PX: 300,
          IMAGE_TREATMENT_MODE: 'css_filter_only',
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const flags = parsePyFlags(await readFile(cfg, 'utf8'));
  const body =
    JSON.stringify(
      {
        _source: 'etl/config.py (GATE #3 flags) — regenerate with `npm run prepare:assets`',
        _note:
          'Shipping defaults only. Environment variables of the same name win at runtime; see lib/flags.ts.',
        ...flags,
      },
      null,
      2,
    ) + '\n';

  // Byte-stable: do not rewrite an identical file (keeps mtimes quiet).
  if (existsSync(out) && (await readFile(out, 'utf8')) === body) {
    log('flags.json up to date', JSON.stringify(flags));
    return;
  }
  await writeFile(out, body);
  log('flags.json written from etl/config.py', JSON.stringify(flags));
}

/* ------------------------------------------------------------------ */
/* 3. Published prose that ships as a page                              */
/* ------------------------------------------------------------------ */

/**
 * `/methodology` renders `METHODOLOGY.md` (SPEC §6). The file lives at the repo
 * root because it is a project document first and a page second; copy it into
 * `web/` so the route has it even when only `web/` is deployed.
 */
async function copyProse() {
  const out = path.join(WEB, 'lib', 'generated');
  await mkdir(out, { recursive: true });

  const src = path.join(REPO, 'METHODOLOGY.md');
  const dest = path.join(out, 'methodology.ts');

  let body;
  if (existsSync(src)) {
    body = await readFile(src, 'utf8');
  } else if (existsSync(dest)) {
    log('METHODOLOGY.md absent — keeping the previously copied text');
    return;
  } else {
    body = '# Methodology\n\n_METHODOLOGY.md was not available at build time._\n';
    log('METHODOLOGY.md absent — wrote a placeholder');
  }

  // Emitted as a module rather than a raw .md so it needs no bundler loader and
  // no filesystem read at render time: the page is statically generated.
  const generated =
    '/* GENERATED — METHODOLOGY.md, copied verbatim by scripts/prepare.mjs.\n' +
    '   Edit the repo-root document; never this file. */\n' +
    `export const METHODOLOGY_MD = ${JSON.stringify(body)};\n`;

  if (existsSync(dest) && (await readFile(dest, 'utf8')) === generated) return;
  await writeFile(dest, generated);
  log('METHODOLOGY.md -> lib/generated/methodology.ts');
}

/* ------------------------------------------------------------------ */
/* 4. Design tokens — the DESIGN INTEGRATION POINT                      */
/* ------------------------------------------------------------------ */

/**
 * `app/globals.css` unconditionally does `@import './tokens.css';`. This step
 * keeps `web/app/tokens.css` in sync with `design/system/tokens.css` when the
 * design track has published it, and writes a documented stub when it has not.
 *
 * That is what makes the swap zero-cost: the day the real token file lands, the
 * next build picks it up with no code change and no import to add. Components are
 * built against `--yy-*` custom properties from the first commit either way; the
 * stub defines nothing but the neutral placeholder values.
 */
async function syncTokens() {
  const src = path.join(REPO, 'design', 'system', 'tokens.css');
  const dest = path.join(WEB, 'app', 'tokens.css');

  if (existsSync(src)) {
    const body = await readFile(src, 'utf8');
    const header =
      '/* GENERATED — mirrored from design/system/tokens.css by scripts/prepare.mjs.\n' +
      '   Edit the design-track file, not this one. */\n';
    const out = header + body;
    if (!existsSync(dest) || (await readFile(dest, 'utf8')) !== out) {
      await writeFile(dest, out);
      log('tokens.css mirrored from design/system/tokens.css');
    } else {
      log('tokens.css up to date (real design tokens)');
    }
    return;
  }

  if (existsSync(dest) && (await readFile(dest, 'utf8')).includes('MIRRORED-REAL-TOKENS')) {
    // Real tokens were mirrored earlier and the source has since gone away.
    log('design/system/tokens.css absent — keeping the previously mirrored tokens');
    return;
  }

  const stub = `/* GENERATED STUB — scripts/prepare.mjs.
 *
 * design/system/tokens.css does not exist yet (BUILD_PLAN.md DESIGN INTEGRATION
 * POINT). The moment the design track writes that file, this one is replaced with
 * its contents on the next \`npm run build\` and nothing else changes: app/globals.css
 * already imports it.
 *
 * SPEC.md §4 — the token contract is EXTEND-NEVER-RENAME. Every value below is a
 * NEUTRAL PLACEHOLDER (grayscale plus one accent) and none of it is a design
 * decision. No component may hardcode a colour, a font stack, a radius or a
 * spacing value; they read these custom properties.
 */
:root {
  --yy-color-bg: #ffffff;
  --yy-color-surface: #f6f6f6;
  --yy-color-ink: #14161a;
  --yy-color-ink-muted: #5b6069;
  --yy-color-rule: #d8dade;
  --yy-color-accent: #1b5e9c;
  --yy-color-blank: #8a8f98;

  --yy-font-display: ui-sans-serif, system-ui, sans-serif;
  --yy-font-text: ui-sans-serif, system-ui, sans-serif;
  --yy-font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --yy-space-1: 4px;
  --yy-space-2: 8px;
  --yy-space-3: 12px;
  --yy-space-4: 16px;
  --yy-space-6: 24px;
  --yy-space-8: 32px;

  --yy-radius-1: 2px;
  --yy-radius-2: 6px;

  --yy-measure: 68ch;
}

@media (prefers-color-scheme: dark) {
  :root {
    --yy-color-bg: #0f1113;
    --yy-color-surface: #181b1f;
    --yy-color-ink: #f2f3f5;
    --yy-color-ink-muted: #a2a8b2;
    --yy-color-rule: #2b2f35;
    --yy-color-accent: #67a9e0;
    --yy-color-blank: #7e858f;
  }
}
`;
  if (!existsSync(dest) || (await readFile(dest, 'utf8')) !== stub) {
    await writeFile(dest, stub);
    log('tokens.css stub written (design/system/tokens.css not published yet)');
  } else {
    log('tokens.css stub up to date');
  }
}

await mirrorAssets();
await bridgeFlags();
await copyProse();
await syncTokens();
