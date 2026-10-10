import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <h1>Flag on the play: no such page</h1>
      <p className="yy-caveat">
        Team URLs use the current franchise code plus the season. <code>/team/lv/2003</code> is
        the 2003 Raiders, shown as Oakland. The old codes <code>oak</code>, <code>stl</code> and{' '}
        <code>sd</code> redirect to the current ones. Player URLs use the <code>otc_id</code> and
        cover only the audited v1 population.
      </p>
      <ul>
        <li>
          <Link href="/">Home</Link>
        </li>
        <li>
          <Link href="/division/afc-east">Divisions</Link>
        </li>
        <li>
          <Link href="/methodology">Methodology</Link>
        </li>
      </ul>
    </>
  );
}
