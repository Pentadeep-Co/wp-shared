/**
 * `wp-build package [--skip-verify "<reason>"]` — builds the project and zips
 * its shipped directory to `dist/<slug>-v<version>.zip`, under a top-level
 * `<slug>/` folder so it extracts to `wp-content/plugins/<slug>/` or
 * `wp-content/themes/<slug>/`.
 *
 * Stamps first (the shipped files carry the package.json version), runs the
 * project's own `build` script when it has one (built assets are gitignored,
 * so it always builds fresh), and for a theme runs the verify gate before all
 * of it. The zip name is what wp-sites downloads: `<tag>.zip`.
 */

import { createWriteStream, mkdirSync, statSync } from 'fs';
import { resolve }                                from 'path';
import archiver                                   from 'archiver';
import { verifyGate }                             from './gate';
import { loadProject, tagOf }                     from './project';
import { run }                                    from './run';
import { stamp }                                  from './stamp';

export async function packageCommand( argv: string[] ): Promise<void> {
  const project = loadProject();
  verifyGate( project, argv, 'package' );

  stamp( project );
  if ( project.hasBuild ) {
    run( 'package', 'pnpm', [ 'run', 'build' ], project.dir, true ); // pnpm is a .cmd on Windows
  }

  const distDir = resolve( project.dir, 'dist' );
  const zipName = `${ tagOf( project ) }.zip`;
  const zipPath = resolve( distDir, zipName );
  mkdirSync( distDir, { recursive: true } );
  await zipDirectory( resolve( project.dir, project.shipDir ), project.slug, zipPath );

  const sizeMb = ( statSync( zipPath ).size / 1024 / 1024 ).toFixed( 2 );
  console.log( `package: dist/${ zipName } (${ sizeMb } MB)` );
}

/** Zips the contents of `srcDir` into `outPath`, nested under `destPrefix/`. */
function zipDirectory( srcDir: string, destPrefix: string, outPath: string ): Promise<void> {
  return new Promise<void>( ( res, rej ) => {
    const output  = createWriteStream( outPath );
    const archive = archiver( 'zip', { zlib: { level: 9 } } );

    output.on( 'close', () => res() );
    archive.on( 'warning', ( err: Error ) => rej( err ) );
    archive.on( 'error', ( err: Error ) => rej( err ) );

    archive.pipe( output );
    archive.directory( srcDir, destPrefix );
    void archive.finalize();
  } );
}
