/**
 * `/credits` — image attribution and data credits (`SPEC.md` §5.2).
 *
 * DEDUPLICATED BY AUTHOR. Three authors account for ~49% of usable photos, so
 * rendering 244 near-identical lines would be worse than useless. The grouping is
 * read back from `credits.json` exactly as the asset pipeline generated it.
 *
 * Attribution is the DEFAULT, not the exception: 91.4% of assets legally require
 * it, so every credit here is meant to render VISIBLY. Hiding a credit behind a
 * hover or an "info" affordance is a license violation for those assets.
 *
 * `restrictions = personality` (12 files) is operator-facing and is NOT exposed
 * by this module.
 */

import { asc } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { isSeeded } from './registry';

export interface CreditAuthorLine {
  author: string;
  attribution: string;
  assetCount: number;
  players: string[];
}

export interface CreditLicenseGroup {
  license: string;
  licenseMachine: string;
  licenseUrl: string | null;
  shareAlike: boolean;
  attributionRequired: boolean;
  assetCount: number;
  authorCount: number;
  authors: CreditAuthorLine[];
}

export interface CreditsBundle {
  groups: CreditLicenseGroup[];
  summary: Record<string, unknown>;
  policy: Record<string, unknown>;
  logos: Record<string, unknown>;
  totalPhotoAssets: number;
}

export async function getCredits(): Promise<CreditsBundle> {
  const empty: CreditsBundle = {
    groups: [],
    summary: {},
    policy: {},
    logos: {},
    totalPhotoAssets: 0,
  };
  if (!(await isSeeded('credit_license_group'))) return empty;

  const db = await getDb();
  const [groups, authors, metaRows] = await Promise.all([
    db.select().from(s.creditLicenseGroup).orderBy(asc(s.creditLicenseGroup.sortOrder)),
    db.select().from(s.creditAuthor).orderBy(asc(s.creditAuthor.sortOrder)),
    db.select({ doc: s.creditsMeta.doc }).from(s.creditsMeta).limit(1),
  ]);

  const byLicense = new Map<string, CreditAuthorLine[]>();
  for (const a of authors) {
    const list = byLicense.get(a.licenseMachine) ?? [];
    list.push({
      author: a.author,
      attribution: a.attribution,
      assetCount: a.assetCount,
      players: a.players,
    });
    byLicense.set(a.licenseMachine, list);
  }

  const meta = (metaRows[0]?.doc ?? {}) as Record<string, Record<string, unknown>>;

  return {
    groups: groups.map((g) => ({
      license: g.license,
      licenseMachine: g.licenseMachine,
      licenseUrl: g.licenseUrl,
      shareAlike: g.shareAlike,
      attributionRequired: g.attributionRequired,
      assetCount: g.assetCount,
      authorCount: g.authorCount,
      authors: byLicense.get(g.licenseMachine) ?? [],
    })),
    summary: (meta.summary ?? {}) as Record<string, unknown>,
    policy: (meta.policy ?? {}) as Record<string, unknown>,
    logos: (meta.logos ?? {}) as Record<string, unknown>,
    totalPhotoAssets: groups.reduce((a, g) => a + g.assetCount, 0),
  };
}
