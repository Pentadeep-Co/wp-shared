#!/usr/bin/env node
/**
 * `wp-build <command>` — the tool is TypeScript run through tsx, resolved from
 * this package so the repo using it needs nothing but this dependency.
 */
const { spawnSync } = require( 'child_process' );
const { resolve }   = require( 'path' );

const result = spawnSync(
  process.execPath,
  [ require.resolve( 'tsx/cli' ), resolve( __dirname, '..', 'src', 'cli.ts' ), ...process.argv.slice( 2 ) ],
  { stdio: 'inherit' },
);
process.exit( result.status ?? 1 );
