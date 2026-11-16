/**
 * Reads `.env` files (gitignored) into `process.env` without
 * overwriting what the shell already set. Lines are `KEY=value`; `#` starts a
 * comment; surrounding quotes are dropped.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve }                  from 'path';
import { projectRoot }              from './root';

/** The Figma token, under either name the repo uses. */
export function figmaToken(): string | undefined {
  return process.env.FIGMA_TOKEN || process.env.FIGMA_ACCESS_TOKEN || undefined;
}

/**
 * The theme repo's `.env` first, then the one in the folder above it
 * (`wp-themes/.env`), so one Figma token can serve every theme. A key already
 * set — by the shell or the nearer file — is never overwritten.
 */
export function loadEnv(): void {
  for ( const file of [ resolve( projectRoot, '.env' ), resolve( projectRoot, '..', '.env' ) ] ) {
    if ( existsSync( file ) ) {
      readEnvFile( file );
    }
  }
}

function readEnvFile( file: string ): void {
  for ( const line of readFileSync( file, 'utf8' ).split( /\r?\n/ ) ) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec( line );
    if ( ! match || line.trimStart().startsWith( '#' ) ) {
      continue;
    }
    const key   = match[ 1 ] as string;
    const value = ( match[ 2 ] ?? '' ).replace( /^(['"])(.*)\1$/, '$2' );
    if ( process.env[ key ] === undefined ) {
      process.env[ key ] = value;
    }
  }
}
