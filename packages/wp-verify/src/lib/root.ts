/**
 * The theme being verified is the repo `wp-verify` runs in: its root is the
 * working directory, and its name is `package.json` `name` unless one is given
 * on the command line.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve }                  from 'path';

export const projectRoot = process.cwd();

/** Per-machine state — saved logins and their sessions — kept out of git. */
export const stateDir = resolve( projectRoot, '.verify' );

/** The theme's name: the one given, else `package.json` `name`. */
export function themeName( given?: string ): string {
  if ( given ) {
    return given;
  }
  const pkg = resolve( projectRoot, 'package.json' );
  if ( existsSync( pkg ) ) {
    const name = ( JSON.parse( readFileSync( pkg, 'utf8' ).replace( /^﻿/, '' ) ) as { name?: string } ).name;
    if ( name ) {
      return name;
    }
  }
  console.error( 'verify: run it in a theme repo (no package.json name here).' );
  process.exit( 2 );
}
