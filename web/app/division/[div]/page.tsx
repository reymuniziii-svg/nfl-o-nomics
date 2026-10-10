import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DivisionView } from '../../_shared/division-view';
import { DIVISION_SLUGS, divisionName, isDivisionSlug } from '@/lib/teams';

/** `SPEC.md` §6 — `/division/{div}`, static, 8 pages, current alignment only. */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return DIVISION_SLUGS.map((div) => ({ div }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ div: string }>;
}): Promise<Metadata> {
  const { div } = await params;
  if (!isDivisionSlug(div)) return {};
  const t = `${divisionName(div)} — what a win costs`;
  return {
    title: divisionName(div),
    alternates: { canonical: `/division/${div}` },
    openGraph: {
      url: `/division/${div}`,
      title: t,
      description: 'Four clubs, what each win cost, and where each one sits on the Cap+ field.',
    },
    twitter: { title: t },
  };
}

export default async function DivisionPage({ params }: { params: Promise<{ div: string }> }) {
  const { div } = await params;
  if (!isDivisionSlug(div)) notFound();
  return <DivisionView slug={div} />;
}
