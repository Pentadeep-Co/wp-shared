/**
 * The release gate: for a theme with a `verify.config.ts`, `package` and
 * `release` run `wp-verify` first and stop if it fails.
 *
 * `--skip-verify "<reason>"` is the one way past it. The reason is required,
 * and `release` writes it into the release commit, so a skipped gate is on the
 * record rather than forgotten.
 *
 * In CI (`CI=true`) the gate stands aside with a note: the checks need the
 * local site, which a runner does not have, and the release that CI builds has
 * already passed this gate on the machine that ran `release`.
 */

import { spawnSync }    from 'child_process';
import type { Project } from './project';

export interface GateResult {
  /** The command line with `--skip-verify <reason>` taken out. */
  readonly rest: string[];
  /** Why the gate was skipped, or null when it ran and passed (or wasn't needed). */
  readonly skipped: string | null;
}

export function verifyGate( project: Project, argv: string[], tool: string ): GateResult {
  const rest: string[] = [];
  let reason: string | null = null;

  for ( let i = 0; i < argv.length; i++ ) {
    const arg = argv[ i ] as string;
    if ( arg === '--skip-verify' || arg.startsWith( '--skip-verify=' ) ) {
      reason = ( arg.includes( '=' ) ? arg.slice( arg.indexOf( '=' ) + 1 ) : argv[ ++i ] ?? '' ).trim();
      if ( ! reason || reason.startsWith( '--' ) ) {
        console.error( `${ tool }: --skip-verify needs a reason, e.g. --skip-verify "hotfix for the broken footer link"` );
        process.exit( 2 );
      }
    } else {
      rest.push( arg );
    }
  }

  if ( ! project.verifies ) {
    return { rest, skipped: null };
  }

  if ( reason ) {
    console.warn( `${ tool }: verify SKIPPED — ${ reason }` );
    return { rest, skipped: reason };
  }

  if ( process.env.CI === 'true' ) {
    console.log( `${ tool }: verify stands aside in CI (it needs the local site; \`release\` enforced it).` );
    return { rest, skipped: null };
  }

  console.log( `${ tool }: running \`pnpm verify\` before going on…` );
  const result = spawnSync( 'pnpm', [ 'verify' ], { stdio: 'inherit', cwd: project.dir, shell: true } );
  if ( result.status !== 0 ) {
    console.error( `\n${ tool }: stopped — \`pnpm verify\` failed. Fix what it reports, or pass --skip-verify "<reason>" if this release cannot wait.` );
    process.exit( result.status ?? 1 );
  }
  return { rest, skipped: null };
}
