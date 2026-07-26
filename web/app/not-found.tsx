import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <h1>No such page</h1>
      <p className="yy-caveat">
        Team URLs are keyed on the current franchise code and the season:{' '}
        <code>/team/lv/2003</code> is the 2003 Raiders (rendered as Oakland). Legacy codes —{' '}
        <code>oak</code>, <code>stl</code>, <code>sd</code> — redirect here permanently. Player
        URLs use the <code>otc_id</code> and cover the audited v1 population only.
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
