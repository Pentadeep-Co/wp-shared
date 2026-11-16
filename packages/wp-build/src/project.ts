/**
 * The project `wp-build` works on: the plugin or theme repo in the working
 * directory, described by its `package.json` `release` block.
 *
 * One repo is one plugin or one theme, so nothing here takes a name: the
 * project is wherever the command runs. Every field has a conventional default,
 * so a project needs little more than a `version` and its `release.kind`.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve }                  from 'path';

/** SemVer with an optional pre-release tag (e.g. `0.9.0`, `1.0.0-rc.1`). */
export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;

export type Kind = 'plugin' | 'theme';

export interface Project {
  readonly kind: Kind;
  /** The repo root — the working directory. */
  readonly dir: string;
  /** The WordPress slug: the folder it installs to, and the tag prefix. */
  readonly slug: string;
  /** `package.json` `version` — the single source of truth. */
  readonly version: string;
  /** Directory shipped in the zip, relative to `dir`. */
  readonly shipDir: string;
  /** File carrying the WordPress `Version:` header, relative to `dir`
   *  (a plugin's entry PHP file, a theme's `style.css`). */
  readonly headerFile: string;
  /** PHP version constant to stamp, or null (optional for themes). */
  readonly versionConstant: string | null;
  /** File holding `versionConstant`, relative to `dir`. */
  readonly constantFile: string;
  /** Whether `package.json` has a `build` script. */
  readonly hasBuild: boolean;
  /** Whether a release must pass `wp-verify` first (themes with a verify.config.ts). */
  readonly verifies: boolean;
}

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  release?: {
    kind?: Kind;
    slug?: string;
    tagPrefix?: string;
    shipDir?: string;
    mainFile?: string;
    styleFile?: string;
    versionConstant?: string;
  };
}

export function readPackage( dir: string ): PackageJson {
  const file = resolve( dir, 'package.json' );
  if ( ! existsSync( file ) ) {
    throw new Error( `wp-build: no package.json in ${ dir } — run it in a plugin or theme repo.` );
  }
  // Theme files written by older tooling carry a UTF-8 BOM.
  return JSON.parse( readFileSync( file, 'utf8' ).replace( /^﻿/, '' ) ) as PackageJson;
}

export function loadProject( dir: string = process.cwd() ): Project {
  const pkg = readPackage( dir );
  const rc  = pkg.release ?? {};

  const kind: Kind | undefined = rc.kind ?? ( rc.styleFile ? 'theme' : rc.versionConstant ? 'plugin' : undefined );
  if ( ! kind ) {
    throw new Error( 'wp-build: package.json needs "release": { "kind": "plugin" | "theme" }.' );
  }

  const version = pkg.version;
  if ( ! version || ! SEMVER_RE.test( version ) ) {
    throw new Error( `wp-build: package.json version is missing or not SemVer: ${ String( version ) }` );
  }

  const slug = rc.slug ?? rc.tagPrefix ?? pkg.name;
  if ( ! slug ) {
    throw new Error( 'wp-build: package.json needs a "name" (or "release.slug").' );
  }

  if ( kind === 'plugin' && ! rc.versionConstant ) {
    throw new Error( 'wp-build: a plugin needs "release.versionConstant" (e.g. TRUEFORM_VERSION).' );
  }

  const mainFile = rc.mainFile ?? ( kind === 'plugin' ? `plugin/${ slug }.php` : 'wp/functions.php' );

  return {
    kind,
    dir,
    slug,
    version,
    shipDir:         rc.shipDir ?? ( kind === 'plugin' ? 'plugin' : 'wp' ),
    headerFile:      kind === 'plugin' ? mainFile : ( rc.styleFile ?? 'wp/style.css' ),
    versionConstant: rc.versionConstant ?? null,
    constantFile:    mainFile,
    hasBuild:        Boolean( pkg.scripts?.build ),
    verifies:        kind === 'theme' && existsSync( resolve( dir, 'verify.config.ts' ) ),
  };
}

/** The release tag (and zip name, without `.zip`) for a version. */
export function tagOf( project: Project, version = project.version ): string {
  return `${ project.slug }-v${ version }`;
}

/** Escapes a string for safe use inside a `RegExp`. */
export function escapeRegExp( value: string ): string {
  return value.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
}
