/** Process helpers shared by the commands. All run in the project directory. */

import { spawnSync }       from 'child_process';
import { createInterface } from 'readline';

/** Runs a command, inheriting stdio; exits the process on a non-zero status. */
export function run( tool: string, cmd: string, args: string[], cwd: string, shell = false ): void {
  const result = spawnSync( cmd, args, { stdio: 'inherit', cwd, shell } );
  if ( result.status !== 0 ) {
    console.error( `${ tool }: "${ cmd } ${ args.join( ' ' ) }" failed` );
    process.exit( result.status ?? 1 );
  }
}

/** Like run(), but returns success instead of exiting on failure. */
export function tryRun( cmd: string, args: string[], cwd: string, shell = false ): boolean {
  return spawnSync( cmd, args, { stdio: 'inherit', cwd, shell } ).status === 0;
}

/** Captures trimmed stdout, or null on a non-zero status. */
export function capture( cmd: string, args: string[], cwd: string, shell = false ): string | null {
  const result = spawnSync( cmd, args, { cwd, shell, encoding: 'utf8' } );
  return result.status === 0 ? ( result.stdout ?? '' ).trim() : null;
}

export function prompt( question: string ): Promise<string> {
  const rl = createInterface( { input: process.stdin, output: process.stdout } );
  return new Promise<string>( ( res ) => {
    rl.question( question, ( answer ) => {
      rl.close();
      res( answer );
    } );
  } );
}
