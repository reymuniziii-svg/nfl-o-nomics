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
  return isDivisionSlug(div) ? { title: divisionName(div) } : {};
}

export default async function DivisionPage({ params }: { params: Promise<{ div: string }> }) {
  const { div } = await params;
  if (!isDivisionSlug(div)) notFound();
  return <DivisionView slug={div} />;
}
