import type { Metadata } from 'next';
import { marked } from 'marked';
import { METHODOLOGY_MD } from '@/lib/generated/methodology';

/**
 * `SPEC.md` §6 — `/methodology`, static, 1 page.
 *
 * Renders `METHODOLOGY.md` from the repo root, mirrored into `lib/generated/` by
 * `scripts/prepare.mjs`. The published methodology and the project document are
 * the same file BY CONSTRUCTION: there is no second copy to fall out of date.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Methodology',
  description: 'How every number on this site is computed, and where each record stops.',
};

export default async function MethodologyPage() {
  const html = await marked.parse(METHODOLOGY_MD, { async: true, gfm: true });
  return (
    <article className="yy-prose">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
