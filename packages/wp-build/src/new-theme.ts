/**
 * `wp-build new-theme <slug>` — scaffolds a theme repo at
 * `wp-themes/<slug>/` (git initialised on `main`), wired to wp-shared. Then:
 * `pnpm install`, `pnpm sync-agent-files`, write its CLAUDE.md, and
 * `pnpm link-site <local-site>`; create its GitHub repo when it is ready.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve }          from 'path';
import { run }              from './run';
import { workspaceRoot }    from './workspace';

export function newThemeCommand( argv: string[] ): void {
  const slug = argv.find( ( a ) => ! a.startsWith( '--' ) ) ?? '';
  if ( ! /^[a-z][a-z0-9-]*$/.test( slug ) ) {
    console.error( 'Usage: wp-build new-theme <slug>   (lowercase letters, digits and hyphens, e.g. acme-one)' );
    process.exit( 2 );
  }

  const dir = resolve( workspaceRoot(), 'wp-themes', slug );
  if ( existsSync( dir ) ) {
    console.error( `new-theme: ${ dir } already exists.` );
    process.exit( 1 );
  }

  const shared  = sharedVersion();
  const files: Record<string, string> = {
    'package.json': JSON.stringify( {
      name: slug,
      version: '1.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        stamp: 'wp-build stamp',
        package: 'wp-build package',
        release: 'wp-build release',
        'link-site': 'wp-build link-site',
        'sync-agent-files': 'wp-build sync-agent-files',
        // The release gate applies once the theme has a verify.config.ts.
        verify: 'wp-verify',
        'verify:pull': 'wp-verify pull',
      },
      release: { kind: 'theme', shipDir: 'wp', styleFile: 'wp/style.css' },
      packageManager: 'pnpm@12.4.1',
      devDependencies: {
        '@pentadeep/wp-build': `github:Pentadeep-Co/wp-shared#v${ shared }&path:/packages/wp-build`,
        '@pentadeep/wp-verify': `github:Pentadeep-Co/wp-shared#v${ shared }&path:/packages/wp-verify`,
        typescript: '^6.0.3',
        vite: '^8.0.10',
      },
    }, null, 2 ) + '\n',
    'pnpm-workspace.yaml': 'allowBuilds:\n  esbuild: true\n',
    'vite.config.ts': "import { defineConfig } from 'vite';\nimport { getBaseConfig } from '@pentadeep/wp-build/vite-theme';\n\nexport default defineConfig( getBaseConfig( import.meta.dirname ) );\n",
    'tsconfig.json': JSON.stringify( {
      extends: '@pentadeep/wp-build/tsconfig.theme.json',
      compilerOptions: { paths: { '@ts/*': [ './src/ts/*' ] } },
      include: [ 'src/**/*.ts' ],
    }, null, 2 ) + '\n',
    '.gitignore': 'node_modules/\ndist/\nwp/dist/\nverify-results/\n.verify/\n.env\n.env.local\n',
    'wp/style.css': `/*\nTheme Name: ${ slug }\nAuthor: Pentadeep\nAuthor URI: https://pentadeepco.com\nLicense: GNU General Public License v2 or later\nVersion: 1.0.0\nDescription: Describe this theme.\n*/\n`,
    'wp/functions.php': '<?php\n',
    'wp/index.php': '<?php\n',
    'src/css/main.css': '',
    'src/ts/main.ts': '',
  };

  for ( const sub of [ 'public', 'wp/assets', 'wp/includes', 'wp/parts', 'wp/patterns', 'wp/templates' ] ) {
    mkdirSync( resolve( dir, sub ), { recursive: true } );
  }
  for ( const [ rel, content ] of Object.entries( files ) ) {
    mkdirSync( resolve( dir, rel, '..' ), { recursive: true } );
    writeFileSync( resolve( dir, rel ), content );
  }

  run( 'new-theme', 'git', [ 'init', '-q', '-b', 'main' ], dir );
  console.log( `new-theme: ${ dir }\nNext: cd there, \`pnpm install\`, \`pnpm sync-agent-files\`, write CLAUDE.md, \`pnpm link-site <local-site>\`.` );
}

function sharedVersion(): string {
  return ( JSON.parse( readFileSync( resolve( __dirname, '..', 'package.json' ), 'utf8' ) ) as { version: string } ).version;
}
