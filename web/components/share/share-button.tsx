'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import css from './share-button.module.css';
import { IconDownload } from '@/components/icons';

/**
 * SHARE — copy the page link, or download the share card as a PNG.
 *
 * Review D #3: every shared link used to unfurl blank and nothing linked to a
 * card. This is the one control that does both jobs, mounted beside the page
 * title on team, division and compare. Text buttons, never icon-only
 * (COMPONENTS.md §14's rule for CsvExport applies here too).
 *
 * `imageUrl` is the page's own 1200 × 630 OG image (`opengraph-image` for
 * team/division, `/share/og/compare?…` for compare), so the PNG a reader
 * downloads is byte-identical to what a feed unfurls.
 */
export function ShareButton({
  path,
  imageUrl,
  fileName,
  label = 'Share',
}: {
  /** Site-relative page path to copy, e.g. `/team/kc/2025` or `/compare?a=kc-2019&b=kc-2025`. */
  path: string;
  /** Site-relative URL of the PNG card. */
  imageUrl: string;
  /** Download filename, e.g. `yieldyard-kc-2025.png`. */
  fileName: string;
  label?: string;
}) {
  const [status, setStatus] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const say = useCallback((msg: string) => {
    setStatus(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(''), 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (fallbackUrl) fallbackRef.current?.select();
  }, [fallbackUrl]);

  const copy = useCallback(async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setFallbackUrl(null);
      say('Link copied');
    } catch {
      // Clipboard blocked (permissions, insecure context): show the URL
      // selected so the reader can copy it by hand.
      setFallbackUrl(url);
      say('Copy the selected link');
    }
  }, [path, say]);

  const download = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 4000);
      say('Card downloaded');
    } catch {
      // Last resort: open the PNG itself; the browser's own save works there.
      window.open(imageUrl, '_blank', 'noopener');
      say('Card opened in a new tab');
    } finally {
      setBusy(false);
    }
  }, [imageUrl, fileName, say]);

  return (
    <div className={css.share} role="group" aria-label={label}>
      <button type="button" className={`yy-label ${css.btn}`} onClick={copy}>
        <svg className={css.glyph} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M10 14a4 4 0 0 0 5.66 0l3.17-3.17a4 4 0 0 0-5.66-5.66L12 6.34M14 10a4 4 0 0 0-5.66 0L5.17 13.17a4 4 0 0 0 5.66 5.66L12 17.66"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Copy link
      </button>
      <button
        type="button"
        className={`yy-label ${css.btn}`}
        onClick={download}
        disabled={busy}
        aria-busy={busy}
      >
        <IconDownload className={css.glyph} size={14} aria-hidden="true" />
        Download PNG
      </button>
      {fallbackUrl ? (
        <input
          ref={fallbackRef}
          className={css.fallback}
          type="text"
          readOnly
          value={fallbackUrl}
          aria-label="Page link"
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
      <span className={`yy-label ${css.status}`} role="status" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
