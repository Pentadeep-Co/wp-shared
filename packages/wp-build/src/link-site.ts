/**
 * `wp-build link-site <site> [slug…] [--replace] [--unlink]`
 *
 * Links plugin and theme repos into a local WordPress site:
 * `wp-content/plugins/<slug>` → `wp-plugins/<slug>/plugin`,
 * `wp-content/themes/<slug>`  → `wp-themes/<slug>/wp` (each repo's shipped
 * directory). Windows gets directory junctions (no admin rights needed);
 * elsewhere, symlinks.
 *
 * With no slugs, run inside a plugin or theme repo: links that repo.
 *
 * Safety, because deleting through a link destroys the repo it points at:
 * - an existing link is removed as a link only (never recursively);
 * - a real folder is replaced only with `--replace`, and only after the folder
 *   is checked to be a copy of this plugin or theme;
 * - `--unlink` removes links and never a real folder.
 */

import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, rmSync, rmdirSync, symlinkSync, unlinkSync } from 'fs';
import { resolve }                       from 'path';
import { loadProject, type Project }     from './project';
import { findProject, siteRoot, workspaceRoot } from './workspace';

export function linkSiteCommand( argv: string[] ): void {
  const replace = argv.includes( '--replace' );
  const unlink  = argv.includes( '--unlink' );
  const [ site, ...slugs ] = argv.filter( ( a ) => ! a.startsWith( '--' ) );
  if ( ! site ) {
    console.error( 'Usage: wp-build link-site <local-site | wordpress-root> [slug…] [--replace] [--unlink]' );
    process.exit( 2 );
  }

  const root     = workspaceRoot();
  const wpRoot   = siteRoot( root, site );
  const projects = slugs.length > 0 ? slugs.map( ( slug ) => findProject( root, slug ) ) : [ loadProject() ];

  let failed = false;
  for ( const project of projects ) {
    try {
      const done = unlink ? unlinkOne( wpRoot, project ) : linkOne( wpRoot, project, replace );
      console.log( `link-site: ${ done }` );
    } catch ( err ) {
      failed = true;
      console.error( `link-site: ${ project.slug }: ${ ( err as Error ).message }` );
    }
  }
  process.exit( failed ? 1 : 0 );
}

function placeOf( wpRoot: string, project: Project ): { link: string; target: string } {
  const folder = project.kind === 'plugin' ? 'plugins' : 'themes';
  return {
    link:   resolve( wpRoot, 'wp-content', folder, project.slug ),
    target: resolve( project.dir, project.shipDir ),
  };
}

function isLink( path: string ): boolean {
  return lstatSync( path ).isSymbolicLink();
}

/** Removes a link or junction — the link itself, never what it points at. */
function removeLink( path: string ): void {
  try {
    unlinkSync( path );
  } catch {
    rmdirSync( path ); // a directory junction on Windows
  }
}

function linkOne( wpRoot: string, project: Project, replace: boolean ): string {
  const { link, target } = placeOf( wpRoot, project );
  if ( ! existsSync( target ) ) {
    throw new Error( `nothing to link: ${ target } does not exist (build it first?).` );
  }

  if ( existsSync( link ) || lstatExists( link ) ) {
    if ( isLink( link ) ) {
      if ( sameDir( readlinkSync( link ), target ) ) {
        return `${ project.slug } already linked → ${ target }`;
      }
      removeLink( link );
    } else if ( ! replace ) {
      throw new Error( `${ link } is a real folder — pass --replace to delete it and link the repo instead.` );
    } else {
      assertCopyOf( link, project );
      rmSync( link, { recursive: true, force: true } );
    }
  }

  symlinkSync( target, link, process.platform === 'win32' ? 'junction' : 'dir' );
  return `${ project.slug } linked: ${ link } → ${ target }`;
}

function unlinkOne( wpRoot: string, project: Project ): string {
  const { link } = placeOf( wpRoot, project );
  if ( ! lstatExists( link ) ) {
    return `${ project.slug } not linked`;
  }
  if ( ! isLink( link ) ) {
    throw new Error( `${ link } is a real folder, not a link — left as it is.` );
  }
  removeLink( link );
  return `${ project.slug } unlinked`;
}

function lstatExists( path: string ): boolean {
  try {
    lstatSync( path );
    return true;
  } catch {
    return false;
  }
}

function sameDir( a: string, b: string ): boolean {
  const norm = ( p: string ): string => resolve( p.replace( /^\\\\\?\\/, '' ) ).toLowerCase().replace( /[\\/]+$/, '' );
  return norm( a ) === norm( b );
}

/**
 * Refuses to delete a folder that isn't recognisably this plugin or theme: a
 * plugin's folder must hold a PHP file with a `Plugin Name:` header, a theme's
 * a `style.css` with `Theme Name:`. Nested links inside it are refused too, so
 * a recursive delete can't reach another repo.
 */
function assertCopyOf( folder: string, project: Project ): void {
  const entries = readdirSync( folder, { withFileTypes: true } );
  const looksRight = project.kind === 'plugin'
    ? entries.some( ( e ) => e.isFile() && e.name.endsWith( '.php' ) && /Plugin Name:/i.test( readFileSync( resolve( folder, e.name ), 'utf8' ).slice( 0, 4096 ) ) )
    : existsSync( resolve( folder, 'style.css' ) ) && /Theme Name:/i.test( readFileSync( resolve( folder, 'style.css' ), 'utf8' ).slice( 0, 4096 ) );
  if ( ! looksRight ) {
    throw new Error( `${ folder } doesn't look like a copy of the ${ project.kind } "${ project.slug }" — not deleting it.` );
  }
  const nested = findLink( folder, 4 );
  if ( nested ) {
    throw new Error( `${ folder } contains a link (${ nested }) — not deleting it; remove that link first.` );
  }
}

function findLink( dir: string, depth: number ): string | null {
  if ( depth < 0 ) {
    return null;
  }
  for ( const entry of readdirSync( dir, { withFileTypes: true } ) ) {
    const path = resolve( dir, entry.name );
    if ( entry.isSymbolicLink() ) {
      return path;
    }
    if ( entry.isDirectory() ) {
      const found = findLink( path, depth - 1 );
      if ( found ) {
        return found;
      }
    }
  }
  return null;
}
