/**
 * Public runtime contract of the Source Capture plugin — the shape of
 * `window.SourceCap` (source-capture `INTEGRATIONS.md` §1/§3).
 *
 * Single source of truth: Source Capture's implementation (`api.ts`) is
 * type-checked against this interface, and consumers (true-form's global
 * declaration, future adapters) import it — so a contract change here either
 * compiles everywhere or fails in Source Capture's own type-check; a stale
 * copy can't exist. Contract-stability rules (additive only, etc.) live in
 * source-capture `INTEGRATIONS.md` §1.
 */

export type SourceCapConsentChoice = 'granted' | 'denied';

export interface SourceCapTouchMeta {
  readonly ts: number;
  readonly lp: string;
}

export interface SourceCapApi {
  /** Last-touch value for one param, or null. */
  get( param: string ): string | null;
  /** Last-touch params (copy; empty object when no data / no consent). */
  all(): Record<string, string>;
  /** First-touch params (copy; empty object when no data / no consent). */
  first(): Record<string, string>;
  /** Touch timestamps/landing paths, or null. */
  meta(): { first: SourceCapTouchMeta; last: SourceCapTouchMeta } | null;
  /** Setter ('granted'/'denied'): stores the visitor's choice and applies it
   *  immediately; getter (no argument): the stored choice or null. */
  consent( state?: string ): SourceCapConsentChoice | null | undefined;
}
