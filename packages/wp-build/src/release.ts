/**
 * `wp-build release [version] [--skip-verify "<reason>"]` — prepares a
 * release: (theme: verify gate) → bump `package.json` → stamp → commit
 * `chore(release): <slug> v<x>` → push → open a PR into `main`.
 *
 * Run on any branch but `main`. Merging the PR runs the shared release
 * workflow, which tags `<slug>-v<x>`, builds and publishes `<slug>-v<x>.zip`
 * as a GitHub Release — what wp-sites pins and downloads. A merge that does
 * not change the version publishes nothing (its tag already exists).
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve }                     from 'path';
import { verifyGate }                  from './gate';
import { loadProject, SEMVER_RE }      from './project';
import { capture, prompt, run, tryRun } from './run';
import { stamp }                       from './stamp';

export async function releaseCommand( argv: string[] ): Promise<void> {
  const project = loadProject();
  const branch  = capture( 'git', [ 'rev-parse', '--abbrev-ref', 'HEAD' ], project.dir );

  if ( ! branch || branch === 'HEAD' || branch === 'main' ) {
    console.error( `release: run it on a branch, not "${ branch ?? '?' }" — the release travels to main through a PR.` );
    process.exit( 1 );
  }

  // Before anything is bumped: a failed check leaves the tree as it was.
  const gate = verifyGate( project, argv, 'release' );

  console.log( `Current version: ${ project.version }` );
  const next = ( gate.rest[ 0 ] ?? await prompt( 'New version: ' ) ).trim();

  if ( ! SEMVER_RE.test( next ) ) {
    console.error( `release: "${ next }" is not valid SemVer (e.g. 0.9.1, 1.0.0-beta.1).` );
    process.exit( 1 );
  }
  if ( next === project.version ) {
    console.error( `release: already at ${ next } — choose a new version.` );
    process.exit( 1 );
  }

  // Targeted replace of the version line keeps the package.json diff minimal.
  const pkgPath = resolve( project.dir, 'package.json' );
  const pkgText = readFileSync( pkgPath, 'utf8' );
  const updated = pkgText.replace( /("version"\s*:\s*")[^"]*(")/, `$1${ next }$2` );
  if ( updated === pkgText ) {
    console.error( 'release: no "version" field found in package.json' );
    process.exit( 1 );
  }
  writeFileSync( pkgPath, updated );

  const stamped = stamp( { ...project, version: next } );

  run( 'release', 'git', [ 'add', 'package.json', ...stamped ], project.dir );
  const message = [ '-m', `chore(release): ${ project.slug } v${ next }` ];
  if ( gate.skipped ) {
    message.push( '-m', `Verify skipped: ${ gate.skipped }` );
  }
  run( 'release', 'git', [ 'commit', ...message ], project.dir );
  run( 'release', 'git', [ 'push', '-u', 'origin', branch ], project.dir );

  openPullRequest( project.dir, branch, project.slug, next );

  console.log( `\nPrepared ${ project.slug } v${ next }. Merge the PR into main to publish the release;`
    + ' to ship it, bump the tag in the site\'s wp-sites manifest.' );
}

/**
 * Opens a PR into main, or reports the existing open one. Never fatal — the
 * commit and push already succeeded, so a `gh` hiccup shouldn't fail the prep.
 */
function openPullRequest( dir: string, branch: string, slug: string, version: string ): void {
  const existing = capture( 'gh', [ 'pr', 'list', '--head', branch, '--state', 'open', '--json', 'url', '--jq', '.[0].url // empty' ], dir );
  if ( existing ) {
    console.log( `Open PR already exists: ${ existing }` );
    return;
  }
  const opened = tryRun( 'gh', [
    'pr', 'create', '--base', 'main', '--head', branch,
    '--title', `${ slug } v${ version }`,
    '--body', `Release ${ slug } v${ version }.`,
  ], dir );
  if ( ! opened ) {
    console.warn( `release: could not open a PR automatically — open one from "${ branch }" into main.` );
  }
}
