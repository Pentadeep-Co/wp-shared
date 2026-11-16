/**
 * What a theme tells `pnpm verify` — the theme repo's `verify.config.ts`, default
 * export, typed with `defineVerifyConfig()` so a theme gets checking without
 * importing anything at runtime.
 */

import { existsSync }    from 'fs';
import { resolve }       from 'path';
import { pathToFileURL } from 'url';
import type { Page }     from 'playwright';
import { projectRoot }   from './root';

/** A page's address, or a function that finds one on the live site. */
export type PathSource = string | ( ( site: Site ) => Promise<string> );

export interface Site {
  /** The site's origin, e.g. `http://acme.local`. */
  readonly origin: string;
  /** GETs a path and returns the HTML, for config that has to discover an id. */
  html( path: string ): Promise<string>;
}

export interface PageCheck {
  /** Short, stable name — what `--only` matches and the report prints. */
  readonly name: string;
  readonly path: PathSource;
  /** Defaults to the config's `widths`. */
  readonly widths?: readonly number[];
  /** The status the page should answer with — 404 for a not-found check. Default 200. */
  readonly status?: number;
}

/** A difference the owner has ruled on. Reported on every run, never failed. */
export interface Accept {
  /** Spec node id (`596:7424`), or `*` for every node. Ignored when `selector` is given. */
  readonly node?: string;
  /** The layer's class payload as the design names it (`.btn__label`) — the
   *  ruling then holds for that payload wherever it is drawn. */
  readonly selector?: string;
  /** The property as the report names it (`width`, `border-top`, `present`…), or `*`. */
  readonly prop: string;
  /** Only in this section (the name in the layer's `pattern[…]` brackets). */
  readonly section?: string;
  /** Only at these widths. */
  readonly widths?: readonly number[];
  /** Only on these screens — frame names without the width (`home`, `about`). */
  readonly screens?: readonly string[];
  /** Only where the design value reads exactly this (`#000000`, `24`). */
  readonly design?: string;
  /** Only where the build value reads exactly this (`#323232`). */
  readonly build?: string;
  readonly why: string;
}

export type FrameStatus = 'current' | 'stale';

export interface FrameCheck {
  /** File-safe name; the spec is `design/specs/<name>.json`. */
  readonly name: string;
  /** The frame's node id in the Figma file. */
  readonly nodeId: string;
  /** The frame's width — the viewport it is checked at. */
  readonly width: number;
  readonly path: PathSource;
  /** `stale`: reported, never checked — the design has moved on without it. */
  readonly status: FrameStatus;
  /** Why a stale frame is stale (shown in the report). */
  readonly note?: string;
  /**
   * The page element for each of the frame's top-level `pattern[…]` / `part[…]`
   * children, by the name inside the brackets (`Header`, `Section - FAQ`). A
   * pattern left out is not on this page and is skipped.
   */
  readonly roots: Readonly<Record<string, string>>;
  /** Steps that bring the page to the frame's state (an open drawer, a filled row). */
  readonly prepare?: ( page: Page ) => Promise<void>;
  readonly accept?: readonly Accept[];
}

export interface Assert {
  ok( condition: unknown, message: string ): void;
  equal<T>( got: T, want: T, message: string ): void;
}

export interface BehaviourCheck {
  readonly name: string;
  readonly path: PathSource;
  /** Defaults to the config's `widths`. */
  readonly widths?: readonly number[];
  /**
   * Run signed in as this saved user (`pnpm verify --login <user>`) —
   * for what only a signed-in visitor sees, such as the admin bar. Without a
   * saved session the check fails and says how to make one.
   */
  readonly as?: string;
  /**
   * Emulate a phone or tablet: passed to the browser context as Playwright's
   * `isMobile` / `hasTouch` / `userAgent`. Omitted, the check runs as a desktop.
   */
  readonly device?: { readonly isMobile?: boolean; readonly hasTouch?: boolean; readonly userAgent?: string };
  readonly run: ( page: Page, assert: Assert, width: number ) => Promise<void>;
}

export interface VerifyConfig {
  /** The local site, e.g. `http://acme.local`. */
  readonly origin: string;
  /** The theme's Vite dev server, when the local environment loads assets from it. */
  readonly devServer?: string;
  /** The theme's custom-property prefix, e.g. `--bj-`. */
  readonly cssPrefix: string;
  /** The design's widths — every page check runs at each. */
  readonly widths: readonly number[];
  readonly figma?: { readonly fileKey: string };
  readonly pages: readonly PageCheck[];
  readonly frames?: readonly FrameCheck[];
  /** Design-wide rulings for the measured checks. */
  readonly design?: {
    /** A design class the theme spells differently, recorded as a flag: `{ 'upper-case': 'uppercase' }`. */
    readonly classes?: Readonly<Record<string, string>>;
    /** A whole payload the build carries differently: `{ '.faq__question.fw-regular': '.faq__question' }`. */
    readonly selectors?: Readonly<Record<string, string>>;
    /** Rulings that hold on every frame (usually by `selector`). */
    readonly accept?: readonly Accept[];
  };
  readonly behaviours?: readonly BehaviourCheck[];
  /** Console messages and request URLs that are not the theme's to fix. */
  readonly ignore?: {
    readonly console?: readonly RegExp[];
    readonly requests?: readonly RegExp[];
    /** Element ids printed by code the theme does not own (a plugin's nonce field). */
    readonly ids?: readonly RegExp[];
  };
}

export function defineVerifyConfig( config: VerifyConfig ): VerifyConfig {
  return config;
}

export async function loadConfig( theme: string ): Promise<{ config: VerifyConfig; dir: string }> {
  const dir  = projectRoot;
  const file = resolve( dir, 'verify.config.ts' );
  if ( ! existsSync( file ) ) {
    throw new Error( `verify.config.ts does not exist in ${ dir } — every theme that releases needs one (${ theme }).` );
  }
  const mod = await import( pathToFileURL( file ).href ) as { default?: VerifyConfig | { default?: VerifyConfig } };
  const raw = mod.default;
  const config = raw && 'default' in raw && raw.default ? raw.default : raw as VerifyConfig | undefined;
  if ( ! config || ! ( 'origin' in config ) ) {
    throw new Error( `${ theme }: verify.config.ts has no default export of defineVerifyConfig( … ).` );
  }
  return { config, dir };
}

export async function resolvePath( source: PathSource, site: Site ): Promise<string> {
  return typeof source === 'string' ? source : source( site );
}
