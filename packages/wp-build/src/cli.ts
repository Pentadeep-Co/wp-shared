/**
 * `wp-build <command>` — the shared tooling for every Pentadeep plugin and
 * theme repo. Run inside the repo (through its package.json scripts).
 */

import { linkSiteCommand }       from './link-site';
import { newThemeCommand }       from './new-theme';
import { packageCommand }        from './package';
import { loadProject }           from './project';
import { releaseCommand }        from './release';
import { stamp }                 from './stamp';
import { syncAgentFilesCommand } from './sync-agent-files';

const USAGE = `wp-build <command>

  stamp                              write package.json's version into the WordPress headers
  package [--skip-verify "<why>"]    build and zip to dist/<slug>-v<version>.zip
  release [version] [--skip-verify "<why>"]
                                     bump, stamp, commit, push, open the release PR
  link-site <site> [slug…] [--replace] [--unlink]
                                     link repos into a local WordPress site
  sync-agent-files                   copy the shared agent files into this repo
  new-theme <slug>                   scaffold a theme repo in wp-themes/`;

async function main(): Promise<void> {
  const [ command, ...argv ] = process.argv.slice( 2 );
  switch ( command ) {
    case 'stamp':
      stamp( loadProject() );
      return;
    case 'package':
      return packageCommand( argv );
    case 'release':
      return releaseCommand( argv );
    case 'link-site':
      return linkSiteCommand( argv );
    case 'sync-agent-files':
      return syncAgentFilesCommand();
    case 'new-theme':
      return newThemeCommand( argv );
    default:
      console.log( USAGE );
      process.exit( command && command !== 'help' && command !== '--help' ? 2 : 0 );
  }
}

main().catch( ( err: unknown ) => {
  console.error( err instanceof Error ? err.message : err );
  process.exit( 1 );
} );
