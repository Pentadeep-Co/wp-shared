/**
 * Checks a theme's build on the local site, in a real browser.
 *
 *   pnpm verify                    everything, at every width
 *   pnpm verify --only <name>[,…]  pages / frames / behaviours by name
 *   pnpm verify --kind rules|design|behaviour
 *   pnpm verify --width 320        one width only
 *   pnpm verify --pairs            write design | build images for each failing frame section
 *   pnpm verify --headed           watch it drive the browser
 *   pnpm verify --login <user>     sign in to wp-admin once and save the session
 *   pnpm verify --as <user>        run as that saved user (admin bar showing)
 *
 * Three kinds of check, all of which fail the run (and so `pnpm release`):
 *
 *   rules      every page at every width: it is styled, no PHP error, no console
 *              error or failed request, no sideways scroll, no custom property
 *              that resolves to nothing, every control named, no duplicate id
 *   design     a pulled Figma spec (`pnpm verify:pull`) measured against the
 *              live DOM — sizing mode, padding, gap, direction, type, fill and
 *              borders — never the sample content's own sizes
 *   behaviour  the theme's scripted interactions
 *
 * Writes nothing to the site: every True Form request is answered here, so a
 * submission check never reaches RevitRental, True Form's entries or the inbox.
 * Results (failure screenshots, design | build pairs, the full report) go to
 * `verify-results/` in the theme repo, gitignored and rebuilt each run.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { resolve }                                                    from 'path';
import { chromium, type Browser, type BrowserContext, type Page }     from 'playwright';
import { loadConfig, resolvePath, type Accept, type Assert, type BehaviourCheck, type FrameCheck, type Site, type VerifyConfig } from './lib/config';
import { figmaToken, loadEnv }                                        from './lib/env';
import { stateDir, themeName }                                     from './lib/root';
import { renderNodes, type FrameSpec }                                from './lib/figma';

const INPAGE  = readFileSync( resolve( __dirname, 'lib', 'inpage.js' ), 'utf8' );
const AUTH    = resolve( stateDir, 'auth' );
const USERS   = resolve( stateDir, 'users.local.json' );
const HEIGHT  = 900;
const PHP_ERR = /<b>(?:Fatal error|Parse error|Warning|Notice|Deprecated)<\/b>:|There has been a critical error on this website/;

interface Args {
  theme: string;
  only: string[];
  kind: string | null;
  width: number | null;
  pairs: boolean;
  headed: boolean;
  login: string | null;
  as: string | null;
}

type Status = 'ok' | 'FAIL' | 'STALE' | 'SKIP';

interface Row {
  kind: 'rules' | 'design' | 'behaviour';
  name: string;
  width: number;
  status: Status;
  lines: string[];
  /** The page checked, as a path on the site. */
  path?: string;
  /** Design differences, structured — for triage tooling (report.json). */
  items?: Array<{ section: string; part: string; prop: string; want: unknown; got: unknown; id: string; accepted?: string }>;
}

const rows: Row[] = [];

/** One line to stderr as each check finishes, so a long run shows where it is. */
function tick(): void {
  const row = rows[ rows.length - 1 ];
  if ( row ) process.stderr.write( `  · ${ row.status.padEnd( 5 ) } ${ row.kind.padEnd( 9 ) } ${ row.name } @${ row.width }
` );
}

async function main(): Promise<void> {
  const args = parseArgs( process.argv.slice( 2 ) );
  loadEnv();
  args.theme = themeName( args.theme );
  const { config, dir } = await loadConfig( args.theme );
  const out = resolve( dir, 'verify-results' );
  rmSync( out, { recursive: true, force: true } );
  mkdirSync( out, { recursive: true } );

  await preflight( config );
  const site = siteOf( config );

  const browser = await chromium.launch( { headless: ! args.headed } );
  try {
    if ( args.login ) {
      await login( browser, config, args.theme, args.login );
      return;
    }
    const want = ( kind: string, name: string ): boolean =>
      ( ! args.kind || args.kind === kind ) && ( args.only.length === 0 || args.only.includes( name ) );
    const widths = ( list?: readonly number[] ): number[] =>
      ( list ?? config.widths ).filter( ( w ) => ! args.width || w === args.width );
    const state = args.as ? sessionFor( args.theme, args.as ) : undefined;

    for ( const page of config.pages ) {
      if ( ! want( 'rules', page.name ) ) continue;
      for ( const width of widths( page.widths ) ) {
        await withPage( browser, config, width, state, async ( p, noise ) => {
          const row: Row = { kind: 'rules', name: page.name, width, status: 'ok', lines: [] };
          rows.push( row );
          try {
            const path = await resolvePath( page.path, site );
            row.path = path;
            const response = await p.goto( config.origin + path, { waitUntil: 'load' } );
            await settle( p );
            /* The response body can be gone by the time it is read (Chrome evicts
               it); the rendered document says the same about a PHP error. */
            const html = response ? await response.text().catch( () => p.content() ) : await p.content();
            const status = response?.status() ?? 0;
            if ( status !== ( page.status ?? 200 ) ) row.lines.push( `the page answered ${ status }, not ${ page.status ?? 200 }` );
            if ( PHP_ERR.test( html ) ) row.lines.push( `PHP error in the page: ${ ( PHP_ERR.exec( html ) ?? [ '' ] )[ 0 ].replace( /<\/?b>/g, '' ) }` );
            const external = await externalSheets( p );
            const r = await p.evaluate( ( [ prefix, texts ] ) => ( window as unknown as { __verify: { rules( p: string, t: string[] ): { styled: boolean; overflow: string[]; customProperties: string[]; a11y: string[] } } } ).__verify.rules( prefix, texts ), [ config.cssPrefix, external ] as const );
            if ( ! r.styled ) row.lines.push( `no ${ config.cssPrefix }* custom property is declared — the stylesheet did not load (is the dev server running?)` );
            const ids = config.ignore?.ids ?? [];
            row.lines.push( ...r.overflow, ...r.customProperties, ...r.a11y.filter( ( l ) => ! ids.some( ( re ) => re.test( /^id "([^"]+)"/.exec( l )?.[ 1 ] ?? '\u0000' ) ) ) );
            /* The document's own answer is judged above; its echo in the console is not news. */
            row.lines.push( ...noise().filter( ( l ) => ! ( page.status && page.status >= 400 && ( l.includes( `HTTP ${ page.status }: GET ${ config.origin }${ path }` ) || l.startsWith( 'console error: Failed to load resource' ) ) ) ) );
          } catch ( error ) {
            row.lines.push( explain( error ) );
          }
          if ( row.lines.length ) {
            row.status = 'FAIL';
            await p.screenshot( { path: resolve( out, `rules-${ page.name }-${ width }.png` ), fullPage: true } ).catch( () => {} );
          }
        } );
      }
    }

    for ( const frame of config.frames ?? [] ) {
      if ( ! want( 'design', frame.name ) || ( args.width && frame.width !== args.width ) ) continue;
      await checkFrame( browser, config, dir, out, frame, site, state, args.pairs );
    }

    for ( const behaviour of config.behaviours ?? [] ) {
      if ( ! want( 'behaviour', behaviour.name ) ) continue;
      const signedIn = behaviour.as ? resolve( AUTH, `${ args.theme }-${ behaviour.as }.json` ) : null;
      for ( const width of widths( behaviour.widths ) ) {
        if ( signedIn && ! existsSync( signedIn ) ) {
          rows.push( { kind: 'behaviour', name: behaviour.name, width, status: 'FAIL', lines: [ `needs a saved "${ behaviour.as }" session — run \`pnpm verify --login ${ behaviour.as }\`` ] } );
          tick();
          continue;
        }
        await withPage( browser, config, width, signedIn ?? state, async ( p, noise ) => {
          const row: Row = { kind: 'behaviour', name: behaviour.name, width, status: 'ok', lines: [] };
          rows.push( row );
          try {
            const path = await resolvePath( behaviour.path, site );
            row.path = path;
            await p.goto( config.origin + path, { waitUntil: 'load' } );
            await settle( p );
            await behaviour.run( p, asserter(), width );
            row.lines.push( ...noise() );
          } catch ( error ) {
            row.lines.push( explain( error ) );
          }
          if ( row.lines.length ) {
            row.status = 'FAIL';
            await p.screenshot( { path: resolve( out, `behaviour-${ behaviour.name }-${ width }.png` ), fullPage: true } ).catch( () => {} );
          }
        }, behaviour.device );
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync( resolve( out, 'report.json' ), `${ JSON.stringify( rows, null, 2 ) }\n` );
  process.exit( report( args.theme ) ? 0 : 1 );
}

/* ------------------------------------------------------------------ */

async function checkFrame( browser: Browser, config: VerifyConfig, dir: string, out: string, frame: FrameCheck, site: Site, state: string | undefined, pairs: boolean ): Promise<void> {
  const row: Row = { kind: 'design', name: frame.name, width: frame.width, status: 'ok', lines: [] };
  rows.push( row );

  if ( frame.status === 'stale' ) {
    row.status = 'STALE';
    row.lines.push( frame.note ?? 'the frame is out of date; not checked' );
    tick();
    return;
  }

  const file = resolve( dir, 'design', 'specs', `${ frame.name }.json` );
  if ( ! existsSync( file ) ) {
    row.status = 'FAIL';
    row.lines.push( `no spec — run \`pnpm verify:pull ${ frame.name }\`` );
    tick();
    return;
  }
  const spec = JSON.parse( readFileSync( file, 'utf8' ) ) as FrameSpec;

  const roots: Record<string, string> = {};
  for ( const [ name, id ] of Object.entries( spec.roots ) ) {
    const selector = frame.roots[ name ];
    if ( selector ) roots[ id ] = selector;
  }

  await withPage( browser, config, frame.width, state, async ( p, noise ) => {
    try {
      row.path = await resolvePath( frame.path, site );
      await p.goto( config.origin + row.path, { waitUntil: 'load' } );
      await settle( p );
      if ( frame.prepare ) {
        await frame.prepare( p );
        await settle( p );
      }

      const aliases = { classes: config.design?.classes ?? {}, selectors: config.design?.selectors ?? {} };
      const results = await p.evaluate( ( [ nodes, map, alias ] ) =>
        ( window as unknown as { __verify: { measure( n: unknown, m: unknown, a: unknown ): MeasureRow[] } } ).__verify.measure( nodes, map, alias ), [ spec.nodes, roots, aliases ] as const );

      const accepted = [ ...( config.design?.accept ?? [] ), ...( frame.accept ?? [] ) ];
      const selectorOf = new Map( spec.nodes.map( ( n ) => [ n.id, n.selector ] ) );
      const sectionOf = new Map( Object.entries( spec.roots ).map( ( [ name, id ] ) => [ id, name ] ) );
      const failingRoots = new Set<string>();
      let checked = 0;
      const notes: string[] = [];

      for ( const result of results ) {
        checked += result.checked;
        for ( const problem of result.problems ) {
          const section = sectionOf.get( result.root ) ?? '';
          const screen = frame.name.replace( /-\d+$/, '' );
          const rule = accepted.find( ( a: Accept ) =>
            ( a.selector ? a.selector === selectorOf.get( result.id ) : ( ! a.node || a.node === '*' || a.node === result.id ) )
            && ( a.prop === '*' || a.prop === problem.prop || problem.prop.startsWith( `${ a.prop } (` ) || problem.prop.startsWith( `${ a.prop }-` ) )
            && ( ! a.section || a.section === section.replace( / #\d+$/, '' ) )
            && ( ! a.widths || a.widths.includes( frame.width ) )
            && ( ! a.screens || a.screens.includes( screen ) )
            && ( a.design === undefined || a.design === String( problem.want ) )
            && ( a.build === undefined || a.build === String( problem.got ) ) );
          const line = describeProblem( section, selectorOf.get( result.id ) ?? shortName( result.name ), problem, result.element, result.id );
          if ( rule ) {
            notes.push( `accepted: ${ line } (${ rule.why })` );
            ( row.items ??= [] ).push( { section, part: selectorOf.get( result.id ) ?? result.name, prop: problem.prop, want: problem.want, got: problem.got, id: result.id, accepted: rule.why } );
          } else {
            row.lines.push( line );
            ( row.items ??= [] ).push( { section, part: selectorOf.get( result.id ) ?? result.name, prop: problem.prop, want: problem.want, got: problem.got, id: result.id } );
            failingRoots.add( result.root );
          }
        }
      }
      row.lines.push( ...noise() );
      if ( row.lines.length ) row.status = 'FAIL';
      row.lines.push( ...notes );
      row.lines.push( `${ checked } values measured across ${ results.filter( ( r ) => ! r.skipped ).length } layers` );

      /* Pairs cost a Figma render each — opt in with --pairs, failing sections only. */
      const wantPairs = pairs ? [ ...failingRoots ] : [];
      if ( wantPairs.length ) {
        await writePairs( config, p, out, frame.name, wantPairs, roots, spec, row );
      }
    } catch ( error ) {
      row.status = 'FAIL';
      row.lines.unshift( explain( error ) );
    }
  } );
}

interface MeasureRow {
  id: string;
  name: string;
  root: string;
  element?: string;
  skipped?: string;
  checked: number;
  problems: Array<{ prop: string; want: unknown; got: unknown }>;
}

/** design | build, one image per section, for a person (or the model) to look at. */
async function writePairs( config: VerifyConfig, page: Page, out: string, frame: string, ids: string[], roots: Record<string, string>, spec: FrameSpec, row: Row ): Promise<void> {
  const token = figmaToken();
  if ( ! token || ! config.figma ) {
    row.lines.push( 'no design | build pairs: FIGMA_ACCESS_TOKEN is not set' );
    return;
  }
  const names = Object.fromEntries( Object.entries( spec.roots ).map( ( [ name, id ] ) => [ id, name ] ) );
  const urls = await renderNodes( config.figma.fileKey, ids, token );
  const dirOut = resolve( out, 'pairs', frame );
  mkdirSync( dirOut, { recursive: true } );

  for ( const id of ids ) {
    const selector = roots[ id ];
    const url = urls[ id ];
    if ( ! selector || ! url ) continue;
    const design = Buffer.from( await ( await fetch( url ) ).arrayBuffer() ).toString( 'base64' );
    const built = ( await page.locator( selector ).first().screenshot( { animations: 'disabled' } ) ).toString( 'base64' );
    const sheet = await page.context().newPage();
    await sheet.setViewportSize( { width: 400, height: 300 } );
    await sheet.setContent( `<body style="margin:0;display:flex;gap:16px;align-items:flex-start;background:#ff00ff;font:12px sans-serif">
      <figure style="margin:0"><figcaption style="background:#000;color:#fff;padding:4px">design</figcaption><img src="data:image/png;base64,${ design }"></figure>
      <figure style="margin:0"><figcaption style="background:#000;color:#fff;padding:4px">build</figcaption><img src="data:image/png;base64,${ built }"></figure></body>` );
    await sheet.screenshot( { path: resolve( dirOut, `${ slug( names[ id ] ?? id ) }.png` ), fullPage: true } );
    await sheet.close();
  }
  row.lines.push( `design | build pairs in verify-results/pairs/${ frame }/` );
}

/* ------------------------------------------------------------------ */

async function withPage( browser: Browser, config: VerifyConfig, width: number, state: string | undefined, fn: ( page: Page, noise: () => string[] ) => Promise<void>, device?: BehaviourCheck[ 'device' ] ): Promise<void> {
  const context: BrowserContext = await browser.newContext( {
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 1,
    ...( state ? { storageState: state } : {} ),
    ...( device ?? {} ),
  } );
  /* esbuild's keepNames helper, for any function a config hands to evaluate. */
  await context.addInitScript( 'globalThis.__name = globalThis.__name || ((f) => f);' );
  await context.addInitScript( INPAGE );

  /* Nothing a check does reaches the site's data: True Form's writes are answered here. */
  await context.route( /\/wp-json\/trueform\/v\d+\/(submit|progress|insights)/, ( route ) => {
    if ( route.request().method() === 'GET' ) {
      return route.continue();
    }
    return route.fulfill( { status: 200, contentType: 'application/json', body: JSON.stringify( { success: true, reference: 'VERIFY-0000' } ) } );
  } );

  const page = await context.newPage();
  /* Steps fail fast; page loads get longer — a cold local PHP render can take seconds. */
  page.setDefaultTimeout( 8_000 );
  page.setDefaultNavigationTimeout( 30_000 );
  const problems: string[] = [];
  const ignoredConsole = config.ignore?.console ?? [];
  const ignoredRequests = config.ignore?.requests ?? [];
  page.on( 'console', ( m ) => {
    if ( m.type() === 'error' && ! ignoredConsole.some( ( re ) => re.test( m.text() ) ) ) problems.push( `console error: ${ m.text() }` );
  } );
  page.on( 'pageerror', ( e ) => problems.push( `script error: ${ e.message }` ) );
  page.on( 'requestfailed', ( r ) => {
    const reason = r.failure()?.errorText ?? '';
    if ( reason.includes( 'ERR_ABORTED' ) || ignoredRequests.some( ( re ) => re.test( r.url() ) ) ) return;
    problems.push( `request failed: ${ r.method() } ${ r.url() } (${ reason })` );
  } );
  page.on( 'response', ( r ) => {
    if ( r.status() >= 400 && ! ignoredRequests.some( ( re ) => re.test( r.url() ) ) ) problems.push( `HTTP ${ r.status() }: ${ r.request().method() } ${ r.url() }` );
  } );

  try {
    await fn( page, () => [ ...new Set( problems ) ] );
  } finally {
    await context.close();
    tick();
  }
}

const sheetCache = new Map<string, string>();

/** The text of every stylesheet the page cannot read itself (another origin — the dev server). */
async function externalSheets( page: Page ): Promise<string[]> {
  const hrefs = await page.evaluate( () => ( window as unknown as { __verify: { unreadableSheets(): string[] } } ).__verify.unreadableSheets() );
  const texts: string[] = [];
  for ( const href of hrefs ) {
    if ( ! sheetCache.has( href ) ) {
      const res = await page.request.get( href ).catch( () => null );
      sheetCache.set( href, res && res.ok() ? await res.text() : '' );
    }
    texts.push( sheetCache.get( href ) ?? '' );
  }
  return texts;
}

/** Network quiet, fonts in, pointer parked — so nothing is measured mid-change. */
async function settle( page: Page ): Promise<void> {
  await page.waitForLoadState( 'networkidle', { timeout: 10_000 } ).catch( () => {} );
  await page.evaluate( () => document.fonts.ready );
  await page.mouse.move( 0, 0 );
  await page.waitForTimeout( 250 );
}

function asserter(): Assert {
  return {
    ok( condition, message ) {
      if ( ! condition ) throw new Error( message );
    },
    equal( got, want, message ) {
      if ( got !== want ) throw new Error( `${ message } — expected ${ JSON.stringify( want ) }, got ${ JSON.stringify( got ) }` );
    },
  };
}

async function preflight( config: VerifyConfig ): Promise<void> {
  const answers = async ( url: string ): Promise<boolean> => {
    try {
      const res = await fetch( url, { signal: AbortSignal.timeout( 8_000 ), redirect: 'manual' } );
      return res.status < 500;
    } catch {
      return false;
    }
  };
  if ( ! await answers( config.origin ) ) {
    console.error( `\n  verify: ${ config.origin } is not answering. Start the local site and try again.\n` );
    process.exit( 1 );
  }
  if ( config.devServer && ! await answers( `${ config.devServer }/@vite/client` ) ) {
    console.error( `\n  verify: the dev server at ${ config.devServer } is not answering — the local site loads its assets from it, so every page would render unstyled. Start it with \`pnpm dev\` in the theme.\n` );
    process.exit( 1 );
  }
}

function siteOf( config: VerifyConfig ): Site {
  return {
    origin: config.origin,
    async html( path ) {
      const res = await fetch( config.origin + path );
      return res.text();
    },
  };
}

/* ------------------------------------------------------------------
   Signed-in runs
   ------------------------------------------------------------------ */

function sessionFor( theme: string, user: string ): string {
  const file = resolve( AUTH, `${ theme }-${ user }.json` );
  if ( ! existsSync( file ) ) {
    console.error( `verify: no saved "${ user }" session for ${ theme } — run \`pnpm verify --login ${ user }\` first.` );
    process.exit( 2 );
  }
  return file;
}

async function login( browser: Browser, config: VerifyConfig, theme: string, key: string ): Promise<void> {
  const users = existsSync( USERS ) ? JSON.parse( readFileSync( USERS, 'utf8' ) ) as Record<string, Record<string, { user: string; password: string }>> : {};
  const user = users[ theme ]?.[ key ];
  if ( ! user ) {
    console.error( `verify: no "${ key }" for ${ theme } in .verify/users.local.json — copy users.example.json (in @pentadeep/wp-verify/src) and fill it in.` );
    process.exit( 2 );
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto( `${ config.origin }/wp-login.php`, { waitUntil: 'load' } );
  await page.fill( '#user_login', user.user );
  await page.fill( '#user_pass', user.password );
  await page.check( '#rememberme' ).catch( () => {} );
  await Promise.all( [ page.waitForURL( /wp-admin/, { timeout: 15_000 } ), page.click( '#wp-submit' ) ] );
  mkdirSync( AUTH, { recursive: true } );
  await context.storageState( { path: resolve( AUTH, `${ theme }-${ key }.json` ) } );
  await context.close();
  console.log( `verify: saved the "${ key }" session for ${ theme }.` );
}

/* ------------------------------------------------------------------ */

function report( theme: string ): boolean {
  const width = Math.max( ...rows.map( ( r ) => `${ r.name } @${ r.width }`.length ), 10 );
  let failed = 0;
  console.log( '' );
  for ( const row of rows ) {
    if ( row.status === 'FAIL' ) failed++;
    const label = `${ row.name } @${ row.width }`.padEnd( width );
    console.log( `  ${ row.status.padEnd( 5 ) } ${ row.kind.padEnd( 9 ) } ${ label }${ row.path ? `  ${ row.path.length > 60 ? `${ row.path.slice( 0, 57 ) }…` : row.path }` : '' }` );
    const shown = row.status === 'ok' ? row.lines.filter( ( l ) => l.startsWith( 'accepted' ) ) : row.lines;
    for ( const line of shown.slice( 0, 12 ) ) console.log( `          ${ line }` );
    if ( shown.length > 12 ) console.log( `          … ${ shown.length - 12 } more in verify-results/report.json` );
  }
  const stale = rows.filter( ( r ) => r.status === 'STALE' ).length;
  console.log( '' );
  console.log( `  ${ rows.length - failed - stale }/${ rows.length } passed${ stale ? ` · ${ stale } stale frame(s) not checked` : '' } · results in verify-results/` );
  console.log( '' );
  return failed === 0;
}

function parseArgs( argv: string[] ): Args {
  const args: Args = { theme: '', only: [], kind: null, width: null, pairs: false, headed: false, login: null, as: null };
  for ( let i = 0; i < argv.length; i++ ) {
    const arg = argv[ i ] as string;
    const next = (): string => {
      const value = argv[ ++i ];
      if ( value === undefined ) {
        console.error( `verify: ${ arg } needs a value` );
        process.exit( 2 );
      }
      return value;
    };
    if ( arg === '--only' ) args.only.push( ...next().split( ',' ) );
    else if ( arg === '--kind' ) args.kind = next();
    else if ( arg === '--width' ) args.width = Number( next() );
    else if ( arg === '--pairs' ) args.pairs = true;
    else if ( arg === '--headed' ) args.headed = true;
    else if ( arg === '--login' ) args.login = next();
    else if ( arg === '--as' ) args.as = next();
    else if ( arg.startsWith( '-' ) ) {
      console.error( `verify: unknown option ${ arg }` );
      process.exit( 2 );
    } else if ( ! args.theme ) args.theme = arg;
    else {
      console.error( `verify: unexpected "${ arg }"` );
      process.exit( 2 );
    }
  }
  return args;
}

/**
 * One difference, in the order a person looks for it: which section, which
 * part of it, what the design shows against what the build shows — then the
 * references (layer id, the element found) in brackets at the end.
 */
function describeProblem( section: string, part: string, problem: { prop: string; want: unknown; got: unknown }, element: string | undefined, id: string ): string {
  const where = `${ section.replace( / #(\d+)$/, ' (instance $1)' ) || 'page' } › ${ part }`;
  const ref = `[layer ${ id }${ element ? ` · ${ element }` : '' }]`;
  const { prop, want, got } = problem;
  const said: Record<string, string> = {
    present: `is not on the page — the design draws it (as ${ want })`,
    padding: `inner spacing (top right bottom left) is ${ got }px; the design has ${ want }px`,
    gap: `space between its items is ${ got }px; the design has ${ want }px`,
    direction: `lays its items out ${ String( got ).toLowerCase() }; the design lays them out ${ String( want ).toLowerCase() }`,
    width: `is ${ got }px wide; the design is ${ want }px`,
    height: `is ${ got }px tall; the design is ${ want }px`,
    'width (hug content)': `is ${ got }px wide, wider than its content (${ want }px); the design sizes it to its content`,
    'width (fill parent)': `is ${ got }px wide; the design fills its column (${ want }px)`,
    'width (fill the row)': 'keeps to its content width; the design stretches it to fill the row',
    'height (fill the row)': `is ${ got }px tall; the design stretches it to the row's height (${ want }px)`,
    'font-size': `text is ${ got }px; the design has ${ want }px`,
    'font-weight': `text weight is ${ got }; the design has ${ want }`,
    'font-family': `font is ${ got }; the design uses ${ want }`,
    'line-height': `line height is ${ got }px; the design has ${ want }px`,
    'letter-spacing': `letter spacing is ${ got }px; the design has ${ want }px`,
    'text-transform': `text case is ${ got }; the design has ${ want }`,
    color: `text colour is ${ got }; the design has ${ want }`,
    background: `background is ${ got }; the design has ${ want }`,
  };
  const side = /^border-(\w+)$/.exec( prop );
  const text = said[ prop ]
    ?? ( side ? `${ side[ 1 ] } rule is ${ got }; the design has ${ want }` : `${ prop } is ${ got }; the design has ${ want }` );
  return `${ where }: ${ text }  ${ ref }`;
}

/** A Playwright error's first line, plus the locator it was waiting on. */
function explain( error: unknown ): string {
  if ( ! ( error instanceof Error ) ) return String( error );
  const lines = error.message.split( '\n' );
  const waiting = lines.find( ( l ) => /waiting for (locator|getBy)/.test( l ) )?.replace( /\x1b\[[0-9;]*m/g, '' ).trim();
  return waiting ? `${ lines[ 0 ] } — ${ waiting }` : ( lines[ 0 ] ?? '' );
}

function shortName( name: string ): string {
  return name.length > 60 ? `…${ name.slice( -57 ) }` : name;
}

function slug( value: string ): string {
  return value.toLowerCase().replace( /[^a-z0-9]+/g, '-' ).replace( /^-|-$/g, '' );
}

main().catch( ( err: unknown ) => {
  console.error( err instanceof Error ? err.stack ?? err.message : err );
  process.exit( 1 );
} );
