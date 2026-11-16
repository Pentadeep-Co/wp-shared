/**
 * `wp-build stamp` — writes `package.json` `version` into the files WordPress
 * reads it from, which it reads as literal text before any PHP runs:
 *
 * - a plugin's entry file: the `Version:` header and its version constant;
 * - a theme's `style.css` `Version:` header, and its version constant when it
 *   names one;
 * - `readme.txt` `Stable tag:` in the shipped directory, when there is one
 *   (wordpress.org serves whatever it names).
 *
 * Idempotent; also the first step of `package` and `release`.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve }                                 from 'path';
import { escapeRegExp, type Project }              from './project';

/** Returns the files it changed, relative to the project. */
export function stamp( project: Project ): string[] {
  const changed: string[] = [];
  const version = project.version;

  const edit = ( rel: string, label: string, re: RegExp, replacement: string ): void => {
    const file = resolve( project.dir, rel );
    const text = readFileSync( file, 'utf8' );
    if ( ! re.test( text ) ) {
      throw new Error( `stamp: could not find ${ label } in ${ rel }` );
    }
    writeFileSync( file, text.replace( re, replacement ) );
    if ( ! changed.includes( rel ) ) {
      changed.push( rel );
    }
    console.log( `stamp: ${ project.slug } → ${ version } (${ rel }, ${ label })` );
  };

  // The header value sits after alignment whitespace, captured so spacing is kept.
  const headerRe = project.kind === 'plugin' ? /^(\s*\*\s*Version:\s+)\S.*$/m : /^(\s*Version:\s+)\S.*$/m;
  edit( project.headerFile, 'the "Version:" header', headerRe, `$1${ version }` );

  if ( project.versionConstant !== null ) {
    const constRe = new RegExp( `(define\\(\\s*'${ escapeRegExp( project.versionConstant ) }',\\s*')[^']*('\\s*\\)\\s*;)` );
    edit( project.constantFile, `the ${ project.versionConstant } define`, constRe, `$1${ version }$2` );
  }

  const readme = `${ project.shipDir }/readme.txt`;
  if ( existsSync( resolve( project.dir, readme ) ) ) {
    edit( readme, '"Stable tag:"', /^(Stable tag:\s+)\S.*$/m, `$1${ version }` );
  }

  return changed;
}
