/**
 * Public runtime contract of the Website Starter plugin — the shape of
 * `window.WebStarter` (website-starter `.claudecode/API.md` §JS).
 *
 * Single source of truth: Website Starter's bundles are type-checked against
 * these interfaces, and themes/other plugins import them. Additive changes
 * only; anything else is a contract version bump (API.md §Stability).
 *
 * Each namespace exists only when its feature is switched on, so consumers
 * detect with optional chaining: `window.WebStarter?.consent?.isGranted(…)`.
 */

/** Built-in consent categories. `necessary` is always granted. */
export type WebStarterConsentCategory = 'necessary' | 'preferences' | 'analytics' | 'marketing';

/** The visitor's recorded choice: one boolean per enabled category. */
export type WebStarterConsentState = Partial<Record<WebStarterConsentCategory, boolean>>;

export interface WebStarterConsentChangeDetail {
  /** The state now in force (null after reset()). */
  readonly state: WebStarterConsentState | null;
  /** The state before this change (null when there was no choice). */
  readonly previous: WebStarterConsentState | null;
}

export interface WebStarterConsentApi {
  /** Categories the site asks about (enabled in settings), excluding `necessary`. */
  categories(): WebStarterConsentCategory[];
  /** The recorded choice, or null when the visitor has not answered (or the
   *  consent version was bumped since they did). */
  get(): WebStarterConsentState | null;
  /** True when a current-version choice is recorded. */
  hasChoice(): boolean;
  /** True when the theme should show its consent UI (no choice recorded). */
  shouldPrompt(): boolean;
  /** Whether a category is granted right now. `necessary` → always true;
   *  no choice yet → false. */
  isGranted( category: string ): boolean;
  /** Record a choice. Categories left out are recorded as denied. */
  set( state: WebStarterConsentState ): void;
  acceptAll(): void;
  rejectAll(): void;
  /** Forget the choice (re-prompts) and deny everything until answered. */
  reset(): void;
  /** Subscribe to changes; returns an unsubscribe function. Also dispatched
   *  as the `webstarter:consent` DOM event on `document`. */
  onChange( listener: ( detail: WebStarterConsentChangeDetail ) => void ): () => void;
  /** The cookie policy URL configured in settings ('' when none). */
  policyUrl(): string;
  /** The consent message for the banner: the admin's text from settings, or
   *  the default written from the enabled categories. Plain text — may hold
   *  line breaks; assign via textContent, never innerHTML. */
  message(): string;
}

export interface WebStarterSourceTouchMeta {
  readonly ts: number;
  readonly lp: string;
}

export type WebStarterSourceConsentChoice = 'granted' | 'denied';

export interface WebStarterSourceApi {
  /** Last-touch value for one param, or null. */
  get( param: string ): string | null;
  /** Last-touch params (copy; {} when no data / no consent). */
  all(): Record<string, string>;
  /** First-touch params (copy; {} when no data / no consent). */
  first(): Record<string, string>;
  /** Touch timestamps/landing paths, or null. */
  meta(): { first: WebStarterSourceTouchMeta; last: WebStarterSourceTouchMeta } | null;
  /** Per-visitor consent for a site NOT using the Consent feature (an
   *  external CMP calls this). Setter stores and applies; getter returns the
   *  stored choice or null. Ignored while the Consent feature is on — the
   *  Consent feature is then the only source of truth. */
  consent( state?: string ): WebStarterSourceConsentChoice | null | undefined;
}

export interface WebStarterGlobal {
  consent?: WebStarterConsentApi;
  source?: WebStarterSourceApi;
}
