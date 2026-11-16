#!/usr/bin/env node
/**
 * `wp-verify [--only …]` checks the theme in the working directory;
 * `wp-verify pull [frame…]` pulls its design specs from Figma.
 *
 * The tool is TypeScript run through tsx, resolved from this package so the
 * theme repo needs nothing but this dependency.
 */
const { spawnSync } = require( 'child_process' );
const { resolve }   = require( 'path' );

const args   = process.argv.slice( 2 );
const pull   = args[ 0 ] === 'pull';
const script = resolve( __dirname, '..', 'src', pull ? 'pull.ts' : 'index.ts' );
const tsx    = require.resolve( 'tsx/cli' );

const result = spawnSync( process.execPath, [ tsx, script, ...( pull ? args.slice( 1 ) : args ) ], { stdio: 'inherit' } );
process.exit( result.status ?? 1 );
