import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import css from '../../../share.module.css';
import { allTeamSeasons, getRosterReceipt } from '@/lib/data';
import { eraIdentity, toAbbr } from '@/lib/teams';
import { RosterReceipt } from '@/components/receipt/roster-receipt';
import { getLiveTeam, isLiveTeamSeason, liveTeamKeys } from '@/lib/data/live';
import { BLANK_REASON, liveAsOfLine } from '@/lib/metric';
import { teamOgImage } from '@/lib/og';

/**
 * `/share/team/{abbr}/{season}` — the two share objects for one team-season,
 * and nothing else: the Roster Receipt (portrait crop, or the 390px column on a
 * phone) and the field card (the page's own 1200 × 630 OG image).
 *
 * A live 2026 page (DECISIONS 116) has no receipt: it shares the live card,
 * versioned `?wk={n}`, with its as-of line, and says why the receipt is absent.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const [keys, liveKeys] = await Promise.all([allTeamSeasons(), liveTeamKeys()]);
  return [...keys, ...liveKeys].map((k) => ({ abbr: k.team.toLowerCase(), season: String(k.season) }));
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
  if (await isLiveTeamSeason(team, Number(season))) {
    const lt = await getLiveTeam(team);
    const week = lt?.status.week ?? 0;
    return {
      title: `${name} · ${season} · week ${week}, live`,
      alternates: { canonical: `/team/${abbr}/${season}` },
      openGraph: {
        title: `${name} · ${season} · week ${week}, live`,
        images: [teamOgImage(abbr, season, week)],
      },
    };
  }
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

  if (await isLiveTeamSeason(team, season)) {
    const lt = await getLiveTeam(team);
    const name = eraIdentity(team, season).name;
    const week = lt?.status.week ?? 0;
    return (
      <div className={css.stage}>
        <p className="yy-label">
          {liveAsOfLine({ season, week, date: lt?.status.date ?? null }).toUpperCase()}
        </p>
        <p className="yy-blank">No receipt. {BLANK_REASON.LIVE_SEASON}</p>
        <Image
          className={css.fieldCard}
          src={teamOgImage(abbr, seasonRaw, week).url}
          width={1200}
          height={630}
          alt={`${name} · ${season}, live through week ${week}: record, games played and Team Rating, live. No verdict.`}
          priority
          unoptimized
        />
      </div>
    );
  }

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
