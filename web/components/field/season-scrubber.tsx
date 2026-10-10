'use client';

/**
 * The season scrubber shared by the league Field and the frontier. Both charts
 * pin their domain across every season, so a scrub moves marks along a fixed
 * scale — the one condition under which `CHART_ANATOMY.md` §6.1 lets them
 * travel. A season whose reading is not published stays on the track and says
 * so; it is never skipped.
 *
 * A native range input: arrow keys, Home/End and page keys come free, and the
 * value text names the season and its coverage for a screen reader.
 */

import css from './field.module.css';

export function SeasonScrubber({
  seasons,
  value,
  onChange,
  blankSeasons = [],
  label,
}: {
  seasons: number[];
  value: number;
  onChange: (s: number) => void;
  /** Seasons drawn as a dashed stop: the chart renders its blank reason there. */
  blankSeasons?: number[];
  label: string;
}) {
  const lo = seasons[0];
  const hi = seasons[seasons.length - 1];
  const i = seasons.indexOf(value);
  const blank = new Set(blankSeasons);
  const step = (d: number) => {
    const next = seasons[Math.max(0, Math.min(seasons.length - 1, i + d))];
    if (next !== undefined) onChange(next);
  };

  return (
    <div className={css.scrub}>
      <button
        type="button"
        className={`yy-label ${css.scrubStep}`}
        onClick={() => step(-1)}
        disabled={i <= 0}
        aria-label="Previous season"
      >
        ‹
      </button>
      <div className={css.scrubTrack}>
        <input
          type="range"
          className={css.scrubInput}
          min={lo}
          max={hi}
          step={1}
          value={value}
          aria-label={label}
          aria-valuetext={`${value}${blank.has(value) ? ', not published this season' : ''}`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className={css.scrubStops} aria-hidden="true">
          {seasons.map((s) => (
            <span
              key={s}
              className={`${css.scrubStop} ${blank.has(s) ? css.scrubStopBlank : ''} ${s === value ? css.scrubStopOn : ''}`}
              style={{ left: `${((s - lo) / Math.max(1, hi - lo)) * 100}%` }}
            />
          ))}
        </div>
        <div className={`yy-label ${css.scrubEnds}`} aria-hidden="true">
          <span>{lo}</span>
          <span>{hi}</span>
        </div>
      </div>
      <button
        type="button"
        className={`yy-label ${css.scrubStep}`}
        onClick={() => step(1)}
        disabled={i >= seasons.length - 1}
        aria-label="Next season"
      >
        ›
      </button>
      <output className={css.scrubValue} aria-live="polite">
        {value}
      </output>
    </div>
  );
}

/**
 * The Review control — a segmented radio group. Arrow keys move the choice,
 * exactly as the hero card's numerator toggle does.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  names,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  /** Visible text per option. */
  names: Record<T, string>;
}) {
  return (
    <div
      className={css.seg}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={(e) => {
        if (disabled || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
        e.preventDefault();
        const i = options.indexOf(value);
        const n = options.length;
        const next = options[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n];
        onChange(next);
        (e.currentTarget.querySelectorAll('[role="radio"]')[options.indexOf(next)] as HTMLElement | undefined)?.focus();
      }}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          tabIndex={value === o ? 0 : -1}
          disabled={disabled}
          className={`yy-label ${css.segBtn}`}
          onClick={() => onChange(o)}
        >
          {names[o]}
        </button>
      ))}
    </div>
  );
}
