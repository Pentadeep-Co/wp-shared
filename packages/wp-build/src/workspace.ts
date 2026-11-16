/**
 * The local workspace every repo is cloned into:
 *
 *   wordpress/
 *     wp-shared/
 *     wp-plugins/<slug>/      one repo per plugin
 *     wp-themes/<slug>/       one repo per theme
 *     wp-sites/
 *     wp-local-instance/<site>/app/public     Local's sites
 *
 * Found by walking up from the working directory (or `WP_WORKSPACE`).
 */

import { existsSync, readdirSync } from 'fs';
import { dirname, resolve }        from 'path';
import { loadProject, type Project } from './project';

export function workspaceRoot( from: string = process.cwd() ): string {
  const env = process.env.WP_WORKSPACE;
  if ( env ) {
    return resolve( env );
  }
  let dir = resolve( from );
  for ( ;; ) {
    if ( existsSync( resolve( dir, 'wp-plugins' ) ) && existsSync( resolve( dir, 'wp-themes' ) ) ) {
      return dir;
    }
    const up = dirname( dir );
    if ( up === dir ) {
      throw new Error( 'wp-build: no workspace (a folder holding wp-plugins/ and wp-themes/) above here — set WP_WORKSPACE.' );
    }
    dir = up;
  }
}

/** A plugin or theme repo in the workspace, by slug. */
export function findProject( root: string, slug: string ): Project {
  for ( const group of [ 'wp-plugins', 'wp-themes' ] ) {
    const dir = resolve( root, group, slug );
    if ( existsSync( resolve( dir, 'package.json' ) ) ) {
      return loadProject( dir );
    }
  }
  throw new Error( `wp-build: no plugin or theme repo "${ slug }" in ${ root }/wp-plugins or wp-themes.` );
}

/** Every plugin and theme repo in the workspace. */
export function allProjects( root: string ): Project[] {
  const out: Project[] = [];
  for ( const group of [ 'wp-plugins', 'wp-themes' ] ) {
    const base = resolve( root, group );
    if ( ! existsSync( base ) ) {
      continue;
    }
    for ( const entry of readdirSync( base, { withFileTypes: true } ) ) {
      if ( entry.isDirectory() && existsSync( resolve( base, entry.name, 'package.json' ) ) ) {
        try {
          out.push( loadProject( resolve( base, entry.name ) ) );
        } catch {
          // Not a plugin or theme repo.
        }
      }
    }
  }
  return out;
}

/**
 * A WordPress root: a Local site's name (`wp-local-instance/<name>/app/public`)
 * or a path to a folder holding `wp-content`.
 */
export function siteRoot( root: string, site: string ): string {
  const local = resolve( root, 'wp-local-instance', site, 'app', 'public' );
  for ( const candidate of [ local, resolve( site ) ] ) {
    if ( existsSync( resolve( candidate, 'wp-content' ) ) ) {
      return candidate;
    }
  }
  throw new Error( `wp-build: "${ site }" is neither a Local site in wp-local-instance/ nor a WordPress root (no wp-content).` );
}
