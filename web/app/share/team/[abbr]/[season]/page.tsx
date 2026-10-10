import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import css from '../../../share.module.css';
import { allTeamSeasons, getRosterReceipt } from '@/lib/data';
import { eraIdentity, toAbbr } from '@/lib/teams';
import { RosterReceipt } from '@/components/receipt/roster-receipt';

/**
 * `/share/team/{abbr}/{season}` — the two share objects for one team-season,
 * and nothing else: the Roster Receipt (portrait crop, or the 390px column on a
 * phone) and the field card (the page's own 1200 × 630 OG image).
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const keys = await allTeamSeasons();
  return keys.map((k) => ({ abbr: k.team.toLowerCase(), season: String(k.season) }));
}

const ogPath = (abbr: string, season: string) => `/team/${abbr}/${season}/opengraph-image`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ abbr: string; season: string }>;
}): Promise<Metadata> {
  const { abbr, season } = await params;
  const team = toAbbr(abbr);
  if (!team) return {};
  const name = eraIdentity(team, Number(season)).name;
  return {
    title: `${name} · ${season} · receipt`,
    alternates: { canonical: `/team/${abbr}/${season}` },
    openGraph: {
      title: `${name} · ${season} — the receipt`,
      images: [{ url: ogPath(abbr, season), width: 1200, height: 630 }],
    },
  };
}

export default async function ShareTeamPage({
  params,
}: {
  params: Promise<{ abbr: string; season: string }>;
}) {
  const { abbr, season: seasonRaw } = await params;
  const team = toAbbr(abbr);
  const season = Number(seasonRaw);
  if (!team || !Number.isInteger(season)) notFound();

  const receipt = await getRosterReceipt(season, team);
  const title = `${eraIdentity(team, season).name} · ${season}`;

  return (
    <div className={css.stage}>
      <div className={css.receiptColumn}>
        <RosterReceipt receipt={receipt} size="column" fallbackTitle={title} />
      </div>
      <div className={css.receiptPortrait}>
        <RosterReceipt receipt={receipt} size="portrait" fallbackTitle={title} />
      </div>
      <Image
        className={css.fieldCard}
        src={ogPath(abbr, seasonRaw)}
        width={1200}
        height={630}
        alt={`${title}: record, verdict, Cap+ as field position against the league average, and the receipt lines.`}
        priority
      />
    </div>
  );
}
