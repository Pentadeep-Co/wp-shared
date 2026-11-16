/**
 * Pulls a theme's design specs from Figma.
 *
 *   pnpm verify:pull                      every frame in its verify.config.ts
 *   pnpm verify:pull <frame>…             named frames only
 *   pnpm verify:pull --missing            only frames with no spec yet (resume a pull)
 *
 * Writes `design/specs/<frame>.json` in the theme repo — committed, so a design
 * change shows up as a diff of exactly what moved. Needs a Figma personal
 * access token with read access to the file, as FIGMA_ACCESS_TOKEN (or
 * FIGMA_TOKEN) in the shell or in the repo-root `.env` (gitignored).
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve }                  from 'path';
import { loadConfig }               from './lib/config';
import { figmaToken, loadEnv }      from './lib/env';
import { fetchNodes, toSpec }       from './lib/figma';
import { themeName }                from './lib/root';

/** Frames per request: a page frame is a large subtree, so a few at a time. */
const BATCH = 4;

async function main(): Promise<void> {
  const argv = process.argv.slice( 2 );
  const missing = argv.includes( '--missing' );
  const names = argv.filter( ( a ) => a !== '--missing' );
  const theme = themeName();

  loadEnv();
  const token = figmaToken();
  if ( ! token ) {
    console.error( 'verify:pull: set FIGMA_ACCESS_TOKEN (or FIGMA_TOKEN) — a Figma personal access token, read-only — in the shell, or in .env here or in the folder above.' );
    process.exit( 2 );
  }

  const { config, dir } = await loadConfig( theme );
  if ( ! config.figma ) {
    console.error( `verify:pull: ${ theme }: verify.config.ts has no figma.fileKey.` );
    process.exit( 2 );
  }

  const out = resolve( dir, 'design', 'specs' );
  const frames = ( config.frames ?? [] )
    .filter( ( f ) => names.length === 0 || names.includes( f.name ) )
    .filter( ( f ) => ! missing || ! existsSync( resolve( out, `${ f.name }.json` ) ) );
  for ( const name of names ) {
    if ( ! ( config.frames ?? [] ).some( ( f ) => f.name === name ) ) {
      console.error( `verify:pull: no frame "${ name }" in verify.config.ts` );
      process.exit( 2 );
    }
  }

  mkdirSync( out, { recursive: true } );

  for ( let i = 0; i < frames.length; i += BATCH ) {
    const batch = frames.slice( i, i + BATCH );
    const { nodes, version } = await fetchNodes( config.figma.fileKey, batch.map( ( f ) => f.nodeId ), token );
    for ( const frame of batch ) {
      const node = nodes[ frame.nodeId ];
      if ( ! node ) {
        console.error( `  ${ frame.name }  Figma has no node ${ frame.nodeId } — node ids drift; find the frame again (DESIGN-SOURCE.md).` );
        process.exitCode = 1;
        continue;
      }
      const spec = toSpec( frame.name, node, frame.width, version );
      writeFileSync( resolve( out, `${ frame.name }.json` ), `${ JSON.stringify( spec, null, 2 ) }
` );

      const unmapped = Object.keys( spec.roots ).filter( ( r ) => ! ( r in frame.roots ) );
      console.log( `  ${ frame.name }  ${ spec.nodes.length } layers from "${ node.name }"${ unmapped.length ? `  — not mapped to the page (skipped): ${ unmapped.join( ', ' ) }` : '' }` );
    }
  }
}

main().catch( ( err: unknown ) => {
  console.error( err instanceof Error ? err.message : err );
  process.exit( 1 );
} );
