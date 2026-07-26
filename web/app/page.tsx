import { DivisionView } from './_shared/division-view';
import { DEFAULT_DIVISION } from '@/lib/teams';

/** `SPEC.md` §6 — `/`, home, division picker defaulted to AFC East. 1 page. */
export const dynamic = 'force-static';

export default async function HomePage() {
  return <DivisionView slug={DEFAULT_DIVISION} />;
}
