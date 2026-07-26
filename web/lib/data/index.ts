/**
 * The data layer — the ONLY way `app/` reads data.
 *
 * Every accessor:
 *   - queries the seeded marts through Drizzle, never a CSV and never nflverse;
 *   - returns `Metric<T>` (`SPEC.md` §1.2) for anything that can be absent, so a
 *     component cannot render a value without handling the blank case;
 *   - is safe to call from a Server Component at build time. Static pages are
 *     produced by `generateStaticParams` + build-time queries; no production page
 *     path opens a database connection per request except `/compare`, which is
 *     ISR-on-demand by design (`ARCHITECTURE.md` §2).
 */

export * from './registry';
export * from './seasons';
export * from './metrics';
export * from './home';
export * from './team';
export * from './player';
export * from './compare';
export * from './credits';
